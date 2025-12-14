import * as vscode from 'vscode';
import { ActiveDbContext } from '../context/ActiveDbContext';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { SchemaContextService } from '../services/SchemaContextService';

export class AiSqlChatParticipant {
    static register(
        context: vscode.ExtensionContext,
        connectionStorage: ConnectionStorage,
        connectionManager: ConnectionManager
    ): vscode.Disposable {
        const schemaService = new SchemaContextService();

        // Use `any` for chat API types to keep compatibility with older VS Code typings.
        const handler = async (request: any, _chatContext: any, stream: any, token: any) => {
            const active = ActiveDbContext.get(context);
            if (!active?.connectionId) {
                stream.markdown('No active connection selected. Select a connection/database in **SQL Explorer** first.');
                return;
            }
            if (!active.database) {
                stream.markdown('No database selected. Expand **Databases**, pick a database, then try again.');
                return;
            }

            const storedConn = await connectionStorage.getConnection(active.connectionId);
            if (!storedConn) {
                stream.markdown('Active connection no longer exists.');
                return;
            }

            // Ensure we have a connector
            if (!connectionManager.getConnection(active.connectionId)) {
                try {
                    await connectionManager.connect(storedConn);
                } catch (e) {
                    stream.markdown(`Failed to connect: ${String(e)}`);
                    return;
                }
            }

            const connector = connectionManager.getConnection(active.connectionId);
            if (!connector) {
                stream.markdown('Not connected.');
                return;
            }

            stream.markdown(`Using database **${active.database}** on connection **${storedConn.name}**. Fetching schema...\n\n`);

            let schemaContext = '';
            try {
                schemaContext = await schemaService.buildSchemaContext(connector, active.database, {
                    maxTables: 120,
                    maxColumnsPerTable: 120
                });
            } catch (e) {
                stream.markdown(`Failed to load schema: ${String(e)}`);
                return;
            }

            // Decide between conversational mode and SQL generation mode.
            // Prefer an LLM-based classifier for intent; fall back to heuristics if unavailable.
            const userText = String(request?.prompt ?? '').trim();

            // Ask Copilot model.
            // NOTE: This requires VS Code versions that support the vscode.lm API.
            try {
                const model = await this.pickModel(request, token, stream);
                if (!model) {
                    return;
                }

                const intent = await this.classifyIntent(model, userText, token);
                const mode: 'sql' | 'chat' = intent === 'SQL_QUERY'
                    ? 'sql'
                    : intent === 'GENERAL_METADATA'
                        ? 'chat'
                        : this.inferIntentHeuristic(userText);

                const sysPrompt = mode === 'sql'
                    ? this.buildSqlSystemPrompt(schemaContext, active.database)
                    : this.buildChatSystemPrompt(schemaContext, active.database);

                const lmMsg: any = (vscode as any).LanguageModelChatMessage;
                const messages = lmMsg
                    ? [
                        lmMsg.User(sysPrompt),
                        lmMsg.User(userText)
                    ]
                    : [
                        // Fallback: many implementations accept `{ role, content }`.
                        { role: 'user', content: sysPrompt },
                        { role: 'user', content: userText }
                    ];

                const response = await model.sendRequest(messages, {}, token);

                const text = await this.readModelText(response);

                if (mode === 'chat') {
                    stream.markdown(text || '(No response)');
                    return;
                }

                let sql = this.extractSql(text);
                if (!sql.trim()) {
                    stream.markdown('Copilot returned an empty SQL response.');
                    return;
                }

                // Open editor and execute.
                const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: sql.trim() + '\n' });
                await vscode.window.showTextDocument(doc, { preview: false });

                // Store active connection for this editor so existing executeQuery uses it.
                await context.workspaceState.update(`activeConnection:${doc.uri.toString()}`, active.connectionId);

                // Execute query using existing command.
                await vscode.commands.executeCommand('sql-client.executeQuery');

                stream.markdown('Done. Opened the query in the editor and executed it.');
            } catch (e) {
                stream.markdown(`Failed to generate SQL via Copilot model API: ${String(e)}\n\nIf your VS Code version doesn’t expose the language model API, we can fallback to a command-driven flow.`);
            }
        };

        // Requires VS Code versions that support chat participants.
        const chat: any = (vscode as any).chat;
        const participant = chat?.createChatParticipant?.('ai-sql.assistant', handler);
        if (!participant) {
            throw new Error('Chat participant API not available');
        }
        participant.displayName = 'AI SQL';

        return participant as vscode.Disposable;
    }

    private static async classifyIntent(model: any, userText: string, token: any): Promise<'SQL_QUERY' | 'GENERAL_METADATA' | 'UNKNOWN'> {
        try {
            const lmMsg: any = (vscode as any).LanguageModelChatMessage;
            const classifierPrompt = this.buildClassifierPrompt(userText);

            const messages = lmMsg
                ? [lmMsg.User(classifierPrompt)]
                : [{ role: 'user', content: classifierPrompt }];

            const response = await model.sendRequest(messages, {}, token);
            const raw = (await this.readModelText(response)).trim();

            // Strict parse: accept only one of these tokens.
            if (raw === 'SQL_QUERY') {
                return 'SQL_QUERY';
            }
            if (raw === 'GENERAL_METADATA') {
                return 'GENERAL_METADATA';
            }

            // Handle JSON fallback if model returns it.
            const m = raw.match(/"intent"\s*:\s*"(SQL_QUERY|GENERAL_METADATA)"/i);
            if (m?.[1]?.toUpperCase() === 'SQL_QUERY') {
                return 'SQL_QUERY';
            }
            if (m?.[1]?.toUpperCase() === 'GENERAL_METADATA') {
                return 'GENERAL_METADATA';
            }

            return 'UNKNOWN';
        } catch {
            return 'UNKNOWN';
        }
    }

    private static buildClassifierPrompt(userText: string): string {
        return [
            'Classify the intent of the following user question about a database.',
            'Return EXACTLY one token and nothing else:',
            '- SQL_QUERY (user wants an executable SQL query, likely to answer a metric/list/report question)',
            '- GENERAL_METADATA (user wants explanation of schema/data, relationships, meaning, report ideas, not a query)',
            '',
            'User question:',
            userText
        ].join('\n');
    }

    private static buildSqlSystemPrompt(schemaContext: string, database: string): string {
        return [
            'You are a senior database engineer. Generate SQL for the user request.',
            `Target database: ${database}`,
            '',
            'Schema (authoritative):',
            schemaContext,
            '',
            'Rules:',
            '- Return ONLY a single SQL query. No prose. No markdown fences.',
            '- Use correct table/column names from the schema.',
            '- Add reasonable filters/joins based on FK relationships when needed.',
            '- Limit to 1000 rows unless the user asks otherwise.',
            '- If the question is ambiguous, make the most reasonable assumption and proceed.'
        ].join('\n');
    }

    private static buildChatSystemPrompt(schemaContext: string, database: string): string {
        return [
            'You are a helpful analytics engineer and database guide.',
            `Target database: ${database}`,
            '',
            'Schema (authoritative):',
            schemaContext,
            '',
            'Respond in conversational natural language.',
            'Explain what the database likely contains, the main entities, and how they relate (based on PK/FK).',
            'Suggest 5-10 useful reports/insights a business user might want.',
            'Do NOT output SQL unless explicitly asked.'
        ].join('\n');
    }

    private static inferIntentHeuristic(input: string): 'sql' | 'chat' {
        const text = (input ?? '').trim();
        const lower = text.toLowerCase();

        // If user pasted SQL, treat as SQL mode (they likely want execution).
        if (/\bselect\b[\s\S]*\bfrom\b/i.test(text) || /\bwith\b\s+\w+\s+as\s*\(/i.test(text)) {
            return 'sql';
        }

        // Chat/exploration intent keywords.
        const chatSignals = [
            'explain',
            'overview',
            'describe',
            'what does',
            'what data',
            'what kind of data',
            'help me understand',
            'familiarize',
            'entities',
            'relationships',
            'how does it work',
            'reports',
            'insights',
            'dashboards',
            'kpis'
        ];
        const hasChatSignal = chatSignals.some(s => lower.includes(s));

        // SQL-generation intent cues: asking for a metric/result set and grouping.
        const sqlSignals = [
            'sql',
            'query',
            'select',
            'join',
            'group by',
            'order by',
            'where',
            'count',
            'sum',
            'avg'
        ];
        const hasSqlSignal = sqlSignals.some(s => lower.includes(s));

        // Strong natural-language query patterns.
        const nlQueryPatterns = [
            /\bgive me\b/i,
            /\bshow me\b/i,
            /\blist\b/i,
            /\breturn\b/i,
            /\bhow many\b/i,
            /\bnumber of\b/i,
            /\bby\s+\w+/i,
            /\blast month\b/i,
            /\blast week\b/i,
            /\byesterday\b/i
        ];
        const looksLikeQueryRequest = nlQueryPatterns.some(r => r.test(text));

        // Decision rules:
        // - Clear explanation -> chat.
        // - Clear query request and no explanation request -> sql.
        // - Ambiguous -> chat (safer; doesn't execute anything).
        if (hasChatSignal && !looksLikeQueryRequest) {
            return 'chat';
        }
        if (looksLikeQueryRequest && !hasChatSignal) {
            return 'sql';
        }
        if (hasSqlSignal && !hasChatSignal) {
            return 'sql';
        }
        return 'chat';
    }

    private static async pickModel(request: any, token: any, stream: any): Promise<any | undefined> {
        // Prefer the model VS Code already selected for this request.
        const model = request?.model;
        if (model) {
            return model;
        }

        const lm: any = (vscode as any).lm;
        const models = await lm?.selectChatModels?.({ vendor: 'copilot' });
        if (!models?.length) {
            stream.markdown('No Copilot chat model available. Make sure GitHub Copilot Chat is installed and enabled.');
            return undefined;
        }
        return models[0];
    }

    private static async readModelText(response: any): Promise<string> {
        // Newer API: response.stream contains LanguageModelTextPart items.
        const stream = response?.stream;
        if (stream && stream[Symbol.asyncIterator]) {
            let acc = '';
            for await (const chunk of stream) {
                // heuristic: many text parts have .value
                if (typeof chunk === 'string') {
                    acc += chunk;
                } else if (chunk?.value && typeof chunk.value === 'string') {
                    acc += chunk.value;
                } else if (chunk?.text && typeof chunk.text === 'string') {
                    acc += chunk.text;
                }
            }
            return acc;
        }

        // Older examples: response.text is an async iterable of strings.
        const text = response?.text;
        if (text && text[Symbol.asyncIterator]) {
            let acc = '';
            for await (const part of text) {
                acc += String(part ?? '');
            }
            return acc;
        }

        if (typeof text === 'string') {
            return text;
        }

        return String(response ?? '');
    }

    private static extractSql(text: string): string {
        // Remove common formatting artifacts.
        const trimmed = text.trim();
        const fenced = trimmed.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) {
            return fenced[1].trim();
        }
        return trimmed;
    }
}
