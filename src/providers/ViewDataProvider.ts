import * as vscode from 'vscode';
import { IDatabaseConnector, QueryResult } from '../connectors/IDatabaseConnector';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { DatabaseType, Column } from '../models/connection';
import { MetadataStorage } from '../storage/metadataStorage';

type SortDirection = 'asc' | 'desc' | 'none';

type ViewState = {
    connectionId: string;
    database?: string;
    schema?: string;
    tableName: string;

    availableColumns: string[];
    selectedColumns: string[];

    limit: number;

    sortColumn?: string;
    sortDirection: SortDirection;

    filterField?: string;
    filterOperator?: '=' | '<' | '>' | 'like';
    filterValue?: string;
};

export class ViewDataProvider {
    private static readonly viewType = 'sqlClient.viewData';
    private panel: vscode.WebviewPanel | undefined;

    private readonly metadataStorage = new MetadataStorage();

    private state: ViewState | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager
    ) {}

    async showTable(connectionId: string, database: string | undefined, schema: string | undefined, tableName: string): Promise<void> {
        const storedConn = await this.connectionStorage.getConnection(connectionId);
        if (!storedConn) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const connector = this.connectionManager.getConnection(connectionId);
        if (!connector) {
            vscode.window.showWarningMessage('Not connected');
            return;
        }

        const columns = await this.getColumnsWithMetadata(connectionId, database, schema, tableName, connector);
        const availableColumns = columns.map(c => c.name);

        const viewColumns = columns.filter(c => c.viewInList === true).map(c => c.name);
        const selectedColumns = viewColumns.length ? viewColumns : availableColumns;

        const limit = 100;

        this.state = {
            connectionId,
            database,
            schema,
            tableName,
            availableColumns,
            selectedColumns,
            limit,
            sortDirection: 'none'
        };

        const title = schema ? `View Data: ${schema}.${tableName}` : `View Data: ${tableName}`;

        if (this.panel) {
            this.panel.title = title;
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                ViewDataProvider.viewType,
                title,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.state = undefined;
            }, null, this.context.subscriptions);

            this.panel.webview.onDidReceiveMessage(async (msg) => {
                if (!msg || typeof msg !== 'object') {
                    return;
                }

                if (msg.type === 'refresh') {
                    await this.handleRefreshMessage(storedConn.type, connector, msg.payload);
                }
            }, null, this.context.subscriptions);
        }

        // Initial data load
        const result = await this.runQuery(storedConn.type, connector, this.state);
        const query = this.buildQuery(storedConn.type, this.state);
        this.panel.webview.html = this.getWebviewContent(this.state, result, query);
    }

    private async handleRefreshMessage(dbType: DatabaseType, connector: IDatabaseConnector, payload: any): Promise<void> {
        if (!this.panel || !this.state) {
            return;
        }

        const next = this.mergeState(this.state, payload);
        this.state = next;

        try {
            const result = await this.runQuery(dbType, connector, next);
            this.panel.webview.postMessage({
                type: 'data',
                payload: {
                    state: next,
                    result,
                    query: this.buildQuery(dbType, next)
                }
            });
        } catch (e: any) {
            this.panel.webview.postMessage({
                type: 'error',
                payload: { message: e?.message ?? String(e) }
            });
        }
    }

    private mergeState(current: ViewState, payload: any): ViewState {
        const next: ViewState = { ...current };

        if (payload && typeof payload === 'object') {
            if (Array.isArray(payload.selectedColumns)) {
                // Keep only valid known columns, keep order, unique.
                const seen = new Set<string>();
                const filtered = payload.selectedColumns
                    .map((c: any) => String(c))
                    .filter((c: string) => current.availableColumns.includes(c))
                    .filter((c: string) => {
                        if (seen.has(c)) {
                            return false;
                        }
                        seen.add(c);
                        return true;
                    });
                // If no columns are selected, show ALL columns.
                next.selectedColumns = filtered.length ? filtered : [...current.availableColumns];
            }

            if (typeof payload.limit === 'number' && [20, 100, 250, 1000].includes(payload.limit)) {
                next.limit = payload.limit;
            }

            if (typeof payload.sortColumn === 'string' || payload.sortColumn === null) {
                const col = payload.sortColumn ? String(payload.sortColumn) : undefined;
                next.sortColumn = col && current.availableColumns.includes(col) ? col : undefined;
            }

            if (payload.sortDirection === 'asc' || payload.sortDirection === 'desc' || payload.sortDirection === 'none') {
                next.sortDirection = payload.sortDirection;
            }

            if (typeof payload.filterField === 'string' || payload.filterField === null) {
                const field = payload.filterField ? String(payload.filterField) : undefined;
                next.filterField = field && current.availableColumns.includes(field) ? field : undefined;
            }

            if (payload.filterOperator === '=' || payload.filterOperator === '<' || payload.filterOperator === '>' || payload.filterOperator === 'like') {
                next.filterOperator = payload.filterOperator;
            }

            if (typeof payload.filterValue === 'string' || payload.filterValue === null) {
                next.filterValue = payload.filterValue ? String(payload.filterValue) : undefined;
            }
        }

        return next;
    }

    private async getColumnsWithMetadata(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string,
        connector: IDatabaseConnector
    ): Promise<Column[]> {
        const cols = await connector.getColumns(tableName, schema);
        const tableMeta = await this.metadataStorage.getTableMetadata(connectionId, database, schema, tableName);
        const fields = tableMeta?.fields ?? {};

        return cols.map(c => {
            const fm = fields[c.name];
            return {
                ...c,
                definition: fm?.definition,
                viewInList: fm?.viewInList,
                refersTo: fm?.refersTo
            };
        });
    }

    private async runQuery(dbType: DatabaseType, connector: IDatabaseConnector, state: ViewState): Promise<QueryResult> {
        const sql = this.buildQuery(dbType, state);
        return await connector.executeQuery(sql);
    }

    private quoteIdentifier(dbType: DatabaseType, identifier: string): string {
        if (dbType === DatabaseType.MSSQL) {
            return `[${identifier.replace(/]/g, ']]')}]`;
        }
        if (dbType === DatabaseType.MySQL) {
            return '`' + identifier.replace(/`/g, '``') + '`';
        }
        // PostgreSQL
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    private sqlStringLiteral(value: string): string {
        return `'${value.replace(/'/g, "''")}'`;
    }

    private coerceLiteral(value: string): string {
        const v = (value ?? '').trim();
        if (!v) {
            return this.sqlStringLiteral('');
        }
        // basic numeric detection
        if (/^-?\d+(\.\d+)?$/.test(v)) {
            return v;
        }
        return this.sqlStringLiteral(v);
    }

    private buildQuery(dbType: DatabaseType, state: ViewState): string {
        const cols = (state.selectedColumns.length ? state.selectedColumns : state.availableColumns)
            .filter(c => state.availableColumns.includes(c));

        const selectList = cols.length
            ? cols.map(c => this.quoteIdentifier(dbType, c)).join(', ')
            : '*';

        const fromTarget = state.schema
            ? `${this.quoteIdentifier(dbType, state.schema)}.${this.quoteIdentifier(dbType, state.tableName)}`
            : this.quoteIdentifier(dbType, state.tableName);

        const whereParts: string[] = [];
        const filterField = state.filterField && state.availableColumns.includes(state.filterField) ? state.filterField : undefined;
        const op = state.filterOperator;
        const filterValue = (state.filterValue ?? '').trim();

        if (filterField && op && filterValue.length) {
            const qField = this.quoteIdentifier(dbType, filterField);
            if (op === 'like') {
                whereParts.push(`${qField} LIKE ${this.sqlStringLiteral(filterValue)}`);
            } else {
                whereParts.push(`${qField} ${op} ${this.coerceLiteral(filterValue)}`);
            }
        }

        const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';

        const sortCol = state.sortColumn && state.availableColumns.includes(state.sortColumn) ? state.sortColumn : undefined;
        const sortDir = state.sortDirection;
        const orderClause = (sortCol && sortDir !== 'none')
            ? ` ORDER BY ${this.quoteIdentifier(dbType, sortCol)} ${sortDir.toUpperCase()}`
            : '';

        const safeLimit = Number.isFinite(state.limit) ? Math.max(1, Math.floor(state.limit)) : 100;

        if (dbType === DatabaseType.MSSQL) {
            return `SELECT TOP (${safeLimit}) ${selectList} FROM ${fromTarget}${whereClause}${orderClause}`;
        }

        // PostgreSQL + MySQL
        return `SELECT ${selectList} FROM ${fromTarget}${whereClause}${orderClause} LIMIT ${safeLimit}`;
    }

    private getWebviewContent(state: ViewState, initialResult: QueryResult, initialQuery: string): string {
        const nonce = this.getNonce();

        // Serialize state/result for initial render.
        const stateJson = this.escapeJson(state);
        const resultJson = this.escapeJson(initialResult);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>View Data</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .toolbar {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 16px;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }
        .row {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
        }
        label {
            font-weight: 600;
        }
        select, input {
            color: var(--vscode-input-foreground);
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 6px;
            border-radius: 3px;
        }
        button {
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
            border: 1px solid var(--vscode-button-border);
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
        }
        button.secondary {
            color: var(--vscode-button-secondaryForeground);
            background-color: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
        }
        .info {
            margin-bottom: 12px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            font-family: var(--vscode-editor-font-family);
        }
        .query {
            margin-top: 6px;
            white-space: pre-wrap;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            cursor: pointer;
            user-select: none;
        }
        td {
            padding: 8px;
            border: 1px solid var(--vscode-panel-border);
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        .null-value {
            color: var(--vscode-editorWarning-foreground);
            font-style: italic;
        }
        .error {
            color: var(--vscode-errorForeground);
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="row">
            <label for="limit">Limit</label>
            <select id="limit">
                <option value="20">20</option>
                <option value="100">100</option>
                <option value="250">250</option>
                <option value="1000">1000</option>
            </select>

            <label for="columns">Columns</label>
            <select id="columns" multiple size="1" style="min-width: 260px;"></select>
        </div>

        <div class="row">
            <button id="applyColumns">Apply Columns</button>
            <button id="selectAllColumns" class="secondary">Select All</button>
        </div>

        <div class="row">
            <label for="filterField">Filter</label>
            <select id="filterField"></select>
            <select id="filterOp">
                <option value="=">=</option>
                <option value="<">&lt;</option>
                <option value=">">&gt;</option>
                <option value="like">like</option>
            </select>
            <input id="filterValue" type="text" placeholder="value" />
            <button id="applyFilter">Apply</button>
            <button id="clearFilter" class="secondary">Clear</button>
        </div>
        <div class="error" id="error"></div>
    </div>

    <div class="info">
        <div><strong>Rows:</strong> <span id="rowCount"></span> | <strong>Execution Time:</strong> <span id="execTime"></span>ms</div>
    </div>

    <div id="tableWrap"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const initialState = ${stateJson};
        const initialResult = ${resultJson};

        let state = initialState;
        let sortColumn = state.sortColumn || null;
        let sortDirection = state.sortDirection || 'none';

        function escapeHtml(text) {
            const s = String(text ?? '');
            return s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function renderControls() {
            // limit
            document.getElementById('limit').value = String(state.limit);

            // filter
            const filterField = document.getElementById('filterField');
            filterField.innerHTML = '';
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '(field)';
            filterField.appendChild(emptyOpt);
            for (const c of state.availableColumns) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                filterField.appendChild(opt);
            }
            filterField.value = state.filterField || '';
            document.getElementById('filterOp').value = state.filterOperator || '=';
            document.getElementById('filterValue').value = state.filterValue || '';

            // multi-select columns
            const columnsSel = document.getElementById('columns');
            columnsSel.innerHTML = '';
            for (const c of state.availableColumns) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                opt.selected = (state.selectedColumns || []).includes(c);
                columnsSel.appendChild(opt);
            }
        }

        function renderResult(result, queryText) {
            document.getElementById('rowCount').textContent = String(result.rowCount ?? 0);
            document.getElementById('execTime').textContent = String(result.executionTime ?? 0);

            const columns = result.columns || [];
            const rows = result.rows || [];

            if (!rows.length) {
                document.getElementById('tableWrap').innerHTML = '<p>No rows returned</p>';
                return;
            }

            const wrap = document.getElementById('tableWrap');
            wrap.innerHTML = '';

            const table = document.createElement('table');

            const thead = document.createElement('thead');
            const headTr = document.createElement('tr');

            for (const c of columns) {
                const th = document.createElement('th');
                th.setAttribute('data-col', c);

                let suffix = '';
                if (sortColumn === c) {
                    suffix = sortDirection === 'asc' ? ' ▲' : (sortDirection === 'desc' ? ' ▼' : '');
                }
                th.textContent = c + suffix;

                th.addEventListener('click', () => {
                    const col = c;

                    if (sortColumn !== col) {
                        sortColumn = col;
                        sortDirection = 'asc';
                    } else {
                        sortDirection = sortDirection === 'asc' ? 'desc' : (sortDirection === 'desc' ? 'none' : 'asc');
                        if (sortDirection === 'none') {
                            sortColumn = null;
                        }
                    }

                    refresh();
                });

                headTr.appendChild(th);
            }

            thead.appendChild(headTr);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            for (const r of rows) {
                const tr = document.createElement('tr');
                for (const c of columns) {
                    const td = document.createElement('td');
                    const v = r[c];
                    if (v === null || v === undefined) {
                        td.className = 'null-value';
                        td.textContent = 'NULL';
                    } else {
                        td.textContent = String(v);
                    }
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);

            wrap.appendChild(table);
        }

        function refresh() {
            document.getElementById('error').textContent = '';

            const columnsSel = document.getElementById('columns');
            let selectedColumns = Array.from(columnsSel.selectedOptions).map(o => o.value);

            // Treat empty selection as "all columns".
            if (!selectedColumns.length) {
                for (const opt of columnsSel.options) {
                    opt.selected = true;
                }
                selectedColumns = Array.from(columnsSel.selectedOptions).map(o => o.value);
            }

            vscode.postMessage({
                type: 'refresh',
                payload: {
                    selectedColumns: selectedColumns,
                    limit: Number(document.getElementById('limit').value),
                    sortColumn: sortColumn,
                    sortDirection: sortDirection,
                    filterField: document.getElementById('filterField').value || null,
                    filterOperator: document.getElementById('filterOp').value,
                    filterValue: document.getElementById('filterValue').value || null
                }
            });
        }

        // events
        document.getElementById('limit').addEventListener('change', refresh);
        document.getElementById('applyColumns').addEventListener('click', refresh);
        document.getElementById('selectAllColumns').addEventListener('click', () => {
            const columnsSel = document.getElementById('columns');
            for (const opt of columnsSel.options) {
                opt.selected = true;
            }
            refresh();
        });
        document.getElementById('applyFilter').addEventListener('click', refresh);
        document.getElementById('clearFilter').addEventListener('click', () => {
            document.getElementById('filterField').value = '';
            document.getElementById('filterOp').value = '=';
            document.getElementById('filterValue').value = '';
            sortColumn = null;
            sortDirection = 'none';
            refresh();
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'data') {
                const r = msg.payload.result;
                const q = msg.payload.query;

                // Keep UI state consistent with what the extension accepted.
                if (msg.payload.state) {
                    state = msg.payload.state;
                    sortColumn = state.sortColumn || null;
                    sortDirection = state.sortDirection || 'none';
                }

                renderControls();
                renderResult(r, q);
                return;
            }

            if (msg.type === 'error') {
                document.getElementById('error').textContent = msg.payload.message || 'Error';
                return;
            }
        });

        renderControls();
        renderResult(initialResult, ${this.escapeJson(initialQuery)});
    </script>
</body>
</html>`;
    }

    private escapeJson(value: any): string {
        return JSON.stringify(value ?? null);
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
