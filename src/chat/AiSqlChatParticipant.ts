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

            // Ask Copilot model to generate SQL.
            // NOTE: This requires VS Code versions that support the vscode.lm API.
            try {
                const model = await this.pickModel(request, token, stream);
                if (!model) {
                    return;
                }

                const sysPrompt = this.buildSystemPrompt(schemaContext, active.database);

                const lmMsg: any = (vscode as any).LanguageModelChatMessage;
                const messages = lmMsg
                    ? [
                        lmMsg.User(sysPrompt),
                        lmMsg.User(String(request?.prompt ?? ''))
                    ]
                    : [
                        // Fallback: many implementations accept `{ role, content }`.
                        { role: 'user', content: sysPrompt },
                        { role: 'user', content: String(request?.prompt ?? '') }
                    ];

                const response = await model.sendRequest(messages, {}, token);

                let sql = this.extractSql(await this.readModelText(response));

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

    private static buildSystemPrompt(schemaContext: string, database: string): string {
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
            '- Limit to 1000 rows unless the user asks otherwise.'
        ].join('\n');
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
