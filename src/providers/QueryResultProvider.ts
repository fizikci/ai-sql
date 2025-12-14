import * as vscode from 'vscode';
import { QueryResult } from '../connectors/IDatabaseConnector';

export class QueryResultProvider {
    private static readonly viewType = 'sqlClient.queryResult';
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    public showResults(result: QueryResult, query: string): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                QueryResultProvider.viewType,
                'Query Results',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.context.subscriptions);
        }

        this.panel.webview.html = this.getWebviewContent(result, query);
    }

    private getWebviewContent(result: QueryResult, query: string): string {
        const maxDisplayRows = 1000;
        const displayRows = result.rows.slice(0, maxDisplayRows);
        const hasMore = result.rows.length > maxDisplayRows;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .info {
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }
        .query {
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
        }
        td {
            padding: 8px;
            border: 1px solid var(--vscode-panel-border);
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        .warning {
            color: var(--vscode-editorWarning-foreground);
            margin-top: 10px;
        }
        .null-value {
            color: var(--vscode-editorWarning-foreground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>Rows:</strong> ${result.rowCount} | 
        <strong>Execution Time:</strong> ${result.executionTime}ms
    </div>
    
    <div class="query">
        <strong>Query:</strong><br>
        ${this.escapeHtml(query)}
    </div>

    ${displayRows.length > 0 ? `
    <table>
        <thead>
            <tr>
                ${result.columns.map(col => `<th>${this.escapeHtml(col)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${displayRows.map(row => `
                <tr>
                    ${result.columns.map(col => {
                        const value = row[col];
                        if (value === null || value === undefined) {
                            return '<td class="null-value">NULL</td>';
                        }
                        return `<td>${this.escapeHtml(String(value))}</td>`;
                    }).join('')}
                </tr>
            `).join('')}
        </tbody>
    </table>
    ${hasMore ? `<div class="warning">Showing first ${maxDisplayRows} rows of ${result.rowCount}</div>` : ''}
    ` : '<p>No rows returned</p>'}
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        const div = { textContent: text };
        const textNode = JSON.stringify(div.textContent);
        return textNode.slice(1, -1)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
