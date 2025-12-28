import * as vscode from 'vscode';
import { IDatabaseConnector, QueryResult } from '../connectors/IDatabaseConnector';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { DatabaseType } from '../models/connection';

type AggregateFunction = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max';

type AggregateItem = {
    field: string;
    func: AggregateFunction;
};

type AggregateState = {
    connectionId: string;
    database?: string;
    schema?: string;
    tableName: string;

    availableColumns: string[];
    aggregations: AggregateItem[];
    includeCountAll: boolean;

    limit: number;

    sortColumn?: string;
    sortDirection: 'asc' | 'desc' | 'none';

    filterField?: string;
    filterOperator?: '=' | '<' | '>' | 'like';
    filterValue?: string;
};

export class AggregateDataProvider {
    private static readonly viewType = 'sqlClient.aggregateData';
    private panel: vscode.WebviewPanel | undefined;

    private state: AggregateState | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager
    ) {}

    async showTable(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string,
        options?: {
            initialAggregations?: AggregateItem[];
            includeCountAll?: boolean;
        }
    ): Promise<void> {
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

        const columns = await connector.getColumns(tableName, schema);
        const availableColumns = columns.map(c => c.name);

        const limit = 100;

        const initialAggregations = Array.isArray(options?.initialAggregations)
            ? options?.initialAggregations
            : [];

        this.state = {
            connectionId,
            database,
            schema,
            tableName,
            availableColumns,
            aggregations: initialAggregations,
            includeCountAll: options?.includeCountAll ?? false,
            limit,
            sortDirection: 'none'
        };

        const title = schema ? `Aggregate Data: ${schema}.${tableName}` : `Aggregate Data: ${tableName}`;

        if (this.panel) {
            this.panel.title = title;
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                AggregateDataProvider.viewType,
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

                if (!this.state) {
                    return;
                }

                if (msg.type === 'refresh') {
                    await this.handleRefreshMessage(storedConn.type, connector, msg.payload);
                }

                if (msg.type === 'addAggregate') {
                    await this.handleAddAggregateMessage(storedConn.type, connector, msg.payload);
                }

                if (msg.type === 'removeAggregate') {
                    await this.handleRemoveAggregateMessage(storedConn.type, connector, msg.payload);
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

    private async handleAddAggregateMessage(dbType: DatabaseType, connector: IDatabaseConnector, payload: any): Promise<void> {
        if (!this.panel || !this.state) {
            return;
        }

        const next = this.addAggregate(this.state, payload);
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

    private async handleRemoveAggregateMessage(dbType: DatabaseType, connector: IDatabaseConnector, payload: any): Promise<void> {
        if (!this.panel || !this.state) {
            return;
        }

        const next = this.removeAggregate(this.state, payload);
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

    private mergeState(current: AggregateState, payload: any): AggregateState {
        const next: AggregateState = { ...current };

        if (payload && typeof payload === 'object') {
            if (typeof payload.limit === 'number' && [20, 50, 100, 500, 1000].includes(payload.limit)) {
                next.limit = payload.limit;
            }

            if (typeof payload.filterField === 'string' || payload.filterField === null) {
                const field = payload.filterField ? String(payload.filterField) : undefined;
                next.filterField = field && current.availableColumns.includes(field) ? field : undefined;
            }

            if (typeof payload.sortColumn === 'string' || payload.sortColumn === null) {
                next.sortColumn = payload.sortColumn ? String(payload.sortColumn) : undefined;
            }

            if (payload.sortDirection === 'asc' || payload.sortDirection === 'desc' || payload.sortDirection === 'none') {
                next.sortDirection = payload.sortDirection;
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

    private addAggregate(current: AggregateState, payload: any): AggregateState {
        const next: AggregateState = { ...current, aggregations: [...current.aggregations] };

        const field = typeof payload?.field === 'string' ? payload.field.trim() : '';
        if (!field || !current.availableColumns.includes(field)) {
            return next;
        }

        const func = this.normalizeFunc(payload?.func);

        const exists = next.aggregations.some(item => item.field === field && item.func === func);
        if (exists) {
            return next;
        }

        next.aggregations.push({ field, func });
        return next;
    }

    private removeAggregate(current: AggregateState, payload: any): AggregateState {
        const next: AggregateState = { ...current };
        const index = typeof payload?.index === 'number' ? payload.index : -1;
        if (index < 0 || index >= current.aggregations.length) {
            return next;
        }
        next.aggregations = current.aggregations.filter((_, i) => i !== index);
        return next;
    }

    private normalizeFunc(value: any): AggregateFunction {
        switch (String(value)) {
            case 'count':
            case 'sum':
            case 'avg':
            case 'min':
            case 'max':
                return value as AggregateFunction;
            default:
                return 'none';
        }
    }

    private async runQuery(dbType: DatabaseType, connector: IDatabaseConnector, state: AggregateState): Promise<QueryResult> {
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
        if (/^-?\d+(\.\d+)?$/.test(v)) {
            return v;
        }
        return this.sqlStringLiteral(v);
    }

    private buildQuery(dbType: DatabaseType, state: AggregateState): string {
        const validAggs = state.aggregations.filter(a => state.availableColumns.includes(a.field));

        const selectParts: string[] = [];
        const groupParts: string[] = [];
        const outputColumns: string[] = [];

        for (const agg of validAggs) {
            const qField = this.quoteIdentifier(dbType, agg.field);
            if (agg.func === 'none') {
                selectParts.push(qField);
                groupParts.push(qField);
                outputColumns.push(agg.field);
                continue;
            }

            const funcName = agg.func.toUpperCase();
            const aliasBase = `${agg.func}_${agg.field}`.replace(/[^\w]+/g, '_');
            const alias = this.quoteIdentifier(dbType, aliasBase || agg.func);
            selectParts.push(`${funcName}(${qField}) AS ${alias}`);
            outputColumns.push(aliasBase || agg.func);
        }

        if (!selectParts.length) {
            selectParts.push(`COUNT(*) AS ${this.quoteIdentifier(dbType, 'count_all')}`);
            outputColumns.push('count_all');
        }
        if (state.includeCountAll && !outputColumns.includes('count_all')) {
            selectParts.push(`COUNT(*) AS ${this.quoteIdentifier(dbType, 'count_all')}`);
            outputColumns.push('count_all');
        }

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
        const groupClause = groupParts.length ? ` GROUP BY ${groupParts.join(', ')}` : '';
        const safeLimit = Number.isFinite(state.limit) ? Math.max(1, Math.floor(state.limit)) : 100;

        const sortCol = state.sortColumn && outputColumns.includes(state.sortColumn) ? state.sortColumn : undefined;
        const sortDir = state.sortDirection;
        const orderClause = (sortCol && sortDir !== 'none')
            ? ` ORDER BY ${this.quoteIdentifier(dbType, sortCol)} ${sortDir.toUpperCase()}`
            : '';

        if (dbType === DatabaseType.MSSQL) {
            return `SELECT TOP (${safeLimit}) ${selectParts.join(', ')} FROM ${fromTarget}${whereClause}${groupClause}${orderClause}`;
        }

        return `SELECT ${selectParts.join(', ')} FROM ${fromTarget}${whereClause}${groupClause}${orderClause} LIMIT ${safeLimit}`;
    }

    private getWebviewContent(state: AggregateState, initialResult: QueryResult, initialQuery: string): string {
        const nonce = this.getNonce();
        const stateJson = this.escapeJson(state);
        const resultJson = this.escapeJson(initialResult);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Aggregate Data</title>
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
        .agg-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .agg-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            background-color: var(--vscode-editor-selectionBackground);
            border-radius: 3px;
            border: 1px solid var(--vscode-panel-border);
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
        .hint {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="row">
            <label for="limit">Limit</label>
            <select id="limit">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
            </select>
        </div>

        <div class="row">
            <label for="aggField">Aggregation</label>
            <select id="aggField"></select>
            <select id="aggFunc">
                <option value="none">(group by)</option>
                <option value="count">count</option>
                <option value="sum">sum</option>
                <option value="avg">avg</option>
                <option value="min">min</option>
                <option value="max">max</option>
            </select>
            <button id="addAgg">Add</button>
        </div>

        <div class="row">
            <div id="aggList" class="agg-list"></div>
            <div id="aggEmpty" class="hint">No fields selected. Query defaults to COUNT(*).</div>
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
        <div class="query" id="query"></div>
    </div>

    <div id="tableWrap"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const initialState = ${stateJson};
        const initialResult = ${resultJson};
        const initialQuery = ${this.escapeJson(initialQuery)};

        let state = initialState;
        let sortColumn = state.sortColumn || null;
        let sortDirection = state.sortDirection || 'none';

        function renderControls() {
            document.getElementById('limit').value = String(state.limit);

            const aggField = document.getElementById('aggField');
            aggField.innerHTML = '';
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '(field)';
            aggField.appendChild(emptyOpt);
            for (const c of state.availableColumns) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                aggField.appendChild(opt);
            }

            const filterField = document.getElementById('filterField');
            filterField.innerHTML = '';
            const emptyFilter = document.createElement('option');
            emptyFilter.value = '';
            emptyFilter.textContent = '(field)';
            filterField.appendChild(emptyFilter);
            for (const c of state.availableColumns) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                filterField.appendChild(opt);
            }
            filterField.value = state.filterField || '';
            document.getElementById('filterOp').value = state.filterOperator || '=';
            document.getElementById('filterValue').value = state.filterValue || '';

            const list = document.getElementById('aggList');
            list.innerHTML = '';

            const emptyHint = document.getElementById('aggEmpty');
            emptyHint.style.display = (state.aggregations || []).length ? 'none' : 'block';

            (state.aggregations || []).forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'agg-item';

                const label = document.createElement('span');
                label.textContent = item.func === 'none' ? item.field + ' (group)' : item.func + '(' + item.field + ')';
                div.appendChild(label);

                const btn = document.createElement('button');
                btn.textContent = 'Remove';
                btn.className = 'secondary';
                btn.setAttribute('data-index', String(index));
                btn.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'removeAggregate',
                        payload: { index: index }
                    });
                });
                div.appendChild(btn);

                list.appendChild(div);
            });
        }

        function renderResult(result, queryText) {
            document.getElementById('rowCount').textContent = String(result.rowCount ?? 0);
            document.getElementById('execTime').textContent = String(result.executionTime ?? 0);
            document.getElementById('query').textContent = queryText || '';

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
            vscode.postMessage({
                type: 'refresh',
                payload: {
                    limit: Number(document.getElementById('limit').value),
                    sortColumn: sortColumn,
                    sortDirection: sortDirection,
                    filterField: document.getElementById('filterField').value || null,
                    filterOperator: document.getElementById('filterOp').value,
                    filterValue: document.getElementById('filterValue').value || null
                }
            });
        }

        document.getElementById('limit').addEventListener('change', refresh);
        document.getElementById('applyFilter').addEventListener('click', refresh);
        document.getElementById('clearFilter').addEventListener('click', () => {
            document.getElementById('filterField').value = '';
            document.getElementById('filterOp').value = '=';
            document.getElementById('filterValue').value = '';
            refresh();
        });
        document.getElementById('addAgg').addEventListener('click', () => {
            const field = document.getElementById('aggField').value;
            const func = document.getElementById('aggFunc').value;
            if (!field) {
                return;
            }
            vscode.postMessage({
                type: 'addAggregate',
                payload: { field, func }
            });
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'data') {
                const r = msg.payload.result;
                const q = msg.payload.query;

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
        renderResult(initialResult, initialQuery);
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
