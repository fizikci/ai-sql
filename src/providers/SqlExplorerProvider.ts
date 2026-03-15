import * as vscode from 'vscode';
import { ConnectionConfig, DatabaseType } from '../models/connection';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { MetadataKeys, MetadataStorage } from '../storage/metadataStorage';

export class TreeNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly connectionId?: string,
        public readonly database?: string,
        public readonly schema?: string,
        public readonly objectName?: string,
        iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
        tooltipText?: string,
        public readonly tableName?: string
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltipText ?? this.label;

        // Provide a stable id so VS Code can preserve expansion state across refreshes.
        // Without this, calling refresh() (e.g. after auto-connect) may collapse nodes.
        const idParts: string[] = [contextValue];
        if (connectionId) idParts.push(connectionId);
        if (database) idParts.push(database);
        if (schema) idParts.push(schema);
        if (objectName) idParts.push(objectName);
        if (tableName) idParts.push(tableName);
        // Connection labels can change when we show connected indicator, so avoid using label for those.
        if (contextValue !== 'connection') idParts.push(label);
        this.id = idParts.join('::');

        if (iconPath) {
            this.iconPath = iconPath;
        }
    }
}

export class SqlExplorerProvider implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = 
        new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager,
        private extensionUri: vscode.Uri
    ) {}

    // Drag-and-drop: move tables between groups
    readonly dragMimeTypes: string[] = ['application/vnd.sql-with-ai.table'];
    readonly dropMimeTypes: string[] = ['application/vnd.sql-with-ai.table'];

    private readonly metadataStorage = new MetadataStorage();

    async handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
        const tables = source.filter(s => s.contextValue === 'table' && !!s.connectionId && !!s.objectName);
        if (!tables.length) {
            return;
        }

        const payload = tables.map(t => ({
            connectionId: t.connectionId,
            database: t.database,
            schema: t.schema,
            tableName: t.objectName
        }));

        dataTransfer.set(this.dragMimeTypes[0], new vscode.DataTransferItem(JSON.stringify(payload)));
    }

    async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
        if (!target || target.contextValue !== 'tableGroup' || !target.connectionId) {
            return;
        }

        const item = dataTransfer.get(this.dropMimeTypes[0]);
        if (!item) {
            return;
        }

        let text = '';
        try {
            text = await item.asString();
        } catch {
            return;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            return;
        }

        const groupName = (target.objectName ?? 'Others').trim() || 'Others';
        const items: Array<{ connectionId: string; database?: string; schema?: string; tableName: string }> = Array.isArray(parsed) ? parsed : [];
        if (!items.length) {
            return;
        }

        for (const t of items) {
            if (!t?.connectionId || !t?.tableName) {
                continue;
            }
            // Only allow drops within the same connection/database scope.
            if (t.connectionId !== target.connectionId) {
                continue;
            }
            if ((t.database ?? undefined) !== (target.database ?? undefined)) {
                continue;
            }
            await this.metadataStorage.setTableGroup(t.connectionId, t.database, t.schema, t.tableName, groupName);
        }

        this.refresh();
    }

    private async getConnectionType(connectionId: string): Promise<DatabaseType | undefined> {
        const config = await this.connectionStorage.getConnection(connectionId);
        return config?.type;
    }

    private formatTableLabel(
        connectionType: DatabaseType | undefined,
        database: string | undefined,
        schema: string | undefined,
        tableName: string,
        contextSchema?: string
    ): string {
        // If we're in a schema context (tree shows schema as parent), just show the table name
        if (contextSchema && schema === contextSchema) {
            return tableName;
        }

        // SQL Server: hide the default schema prefix (dbo.)
        if (connectionType === DatabaseType.MSSQL && schema?.toLowerCase() === 'dbo') {
            return tableName;
        }

        // PostgreSQL: if schema was (incorrectly) set to the database name, hide it.
        if (connectionType === DatabaseType.PostgreSQL && schema && database && schema === database) {
            return tableName;
        }

        return schema ? `${schema}.${tableName}` : tableName;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            // Root level - show connections
            return this.getConnections();
        }

        switch (element.contextValue) {
            case 'connection':
                // Connection is the database — expand directly to schemas.
                return this.getSchemas(element);
            case 'schema':
                // Schema level: show object categories for the selected schema
                return this.getDatabaseObjectCategories(element);
            case 'tables':
                return this.getTables(element);
            case 'tableGroup':
                return this.getTablesInGroup(element);
            case 'views':
                return this.getViews(element);
            case 'procedures':
                return this.getProcedures(element);
            case 'functions':
                return this.getFunctions(element);
            case 'table':
                return this.getTableChildren(element);
            case 'columns':
                return this.getColumns(element);
            case 'indexes':
                return this.getIndexes(element);
            case 'constraints':
                return this.getConstraints(element);
            default:
                return [];
        }
    }

    private async getConnections(): Promise<TreeNode[]> {
        const connections = await this.connectionStorage.getConnections();
        return connections.map(conn => {
            const icon = this.getConnectionIcon(conn.type);
            const isConnected = this.connectionManager.isConnected(conn.id);
            // Always derive display name from database+host for clarity.
            // For backward-compatible connections without a database, fall back to host only.
            const displayName = conn.database ? `${conn.database} on ${conn.host}` : conn.host;
            const label = isConnected ? `● ${displayName}` : displayName;
            
            return new TreeNode(
                label,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                conn.id,
                conn.database,
                undefined,
                undefined,
                icon,
                `${displayName} (${conn.type})`
            );
        });
    }

    private getDatabaseObjectCategories(element: TreeNode): TreeNode[] {
        // Defensive: if for some reason we don't have a database or schema name, don't show object categories.
        if (!element.database || !element.schema) {
            return [];
        }

        return [
            new TreeNode(
                'Tables',
                vscode.TreeItemCollapsibleState.Collapsed,
                'tables',
                element.connectionId,
                element.database,
                element.schema,
                undefined,
                new vscode.ThemeIcon('table')
            ),
            new TreeNode(
                'Views',
                vscode.TreeItemCollapsibleState.Collapsed,
                'views',
                element.connectionId,
                element.database,
                element.schema,
                undefined,
                new vscode.ThemeIcon('eye')
            ),
            new TreeNode(
                'Procedures',
                vscode.TreeItemCollapsibleState.Collapsed,
                'procedures',
                element.connectionId,
                element.database,
                element.schema,
                undefined,
                new vscode.ThemeIcon('symbol-method')
            ),
            new TreeNode(
                'Functions',
                vscode.TreeItemCollapsibleState.Collapsed,
                'functions',
                element.connectionId,
                element.database,
                element.schema,
                undefined,
                new vscode.ThemeIcon('symbol-function')
            )
        ];
    }

    private async getSchemas(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId || !element.database) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const schemas = await connector.getSchemas(element.database);
            return schemas.map(schema => 
                new TreeNode(
                    schema,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'schema',
                    element.connectionId,
                    element.database,
                    schema,
                    undefined,
                    new vscode.ThemeIcon('file-directory')
                )
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load schemas: ${error}`);
            return [];
        }
    }

    private async getTables(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const connectionType = await this.getConnectionType(element.connectionId);
            const tables = await connector.getTables(element.database, element.schema);

            // Read metadata once to avoid many filesystem reads.
            const file = await this.metadataStorage.read();
            const conn = file.connections?.[element.connectionId] as any;
            const dbMeta = conn?.databases?.[MetadataKeys.dbKey(element.database)] as any;
            const tableMeta = (dbMeta?.tables ?? {}) as Record<string, any>;

            // Collect only custom (non-Others) groups.
            const customGroups = new Set<string>();
            for (const t of tables) {
                const key = MetadataKeys.tableKey(t.schema, t.name);
                const g = String(tableMeta?.[key]?.group ?? '').trim();
                if (g && g.toLowerCase() !== 'others') {
                    customGroups.add(g);
                }
            }

            // If every table is ungrouped, skip group folders and render tables directly.
            if (customGroups.size === 0) {
                const sorted = [...tables].sort((a, b) => {
                    const as = (a.schema ?? '').toLowerCase();
                    const bs = (b.schema ?? '').toLowerCase();
                    if (as !== bs) { return as.localeCompare(bs); }
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });
                return await Promise.all(sorted.map(async (t) => {
                    const meta = await this.metadataStorage.getTableMetadata(element.connectionId!, element.database, t.schema, t.name);
                    const label = this.formatTableLabel(connectionType, element.database, t.schema, t.name, element.schema);
                    const tooltip = meta?.definition ? `${label}\n${meta.definition}` : label;
                    return new TreeNode(
                        label,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'table',
                        element.connectionId,
                        element.database,
                        t.schema,
                        t.name,
                        new vscode.ThemeIcon('table'),
                        tooltip
                    );
                }));
            }

            // There are custom groups — render group folders; custom groups sorted a-z, Others last.
            const groupNames = Array.from(customGroups).sort((a, b) => a.localeCompare(b));
            groupNames.push('Others');

            return groupNames.map(groupName => new TreeNode(
                groupName,
                vscode.TreeItemCollapsibleState.Collapsed,
                'tableGroup',
                element.connectionId,
                element.database,
                element.schema,
                groupName,
                new vscode.ThemeIcon('folder')
            ));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load tables: ${error}`);
            return [];
        }
    }

    private async getTablesInGroup(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId || !element.objectName) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const connectionType = await this.getConnectionType(element.connectionId);
            const tables = await connector.getTables(element.database, element.schema);

            const groupName = (element.objectName ?? 'Others').trim() || 'Others';

            // Read metadata once.
            const file = await this.metadataStorage.read();
            const conn = file.connections?.[element.connectionId] as any;
            const dbMeta = conn?.databases?.[MetadataKeys.dbKey(element.database)] as any;
            const tableMeta = (dbMeta?.tables ?? {}) as Record<string, any>;

            const filtered = [] as { schema?: string; name: string }[];
            for (const t of tables) {
                const key = MetadataKeys.tableKey(t.schema, t.name);
                const g = String(tableMeta?.[key]?.group ?? '').trim() || 'Others';
                if (g === groupName) {
                    filtered.push({ schema: t.schema, name: t.name });
                }
            }

            filtered.sort((a, b) => {
                const as = (a.schema ?? '').toLowerCase();
                const bs = (b.schema ?? '').toLowerCase();
                if (as !== bs) return as.localeCompare(bs);
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });

            return await Promise.all(filtered.map(async (t) => {
                const meta = await this.metadataStorage.getTableMetadata(element.connectionId!, element.database, t.schema, t.name);
                const label = this.formatTableLabel(connectionType, element.database, t.schema, t.name, element.schema);
                const tooltip = meta?.definition ? `${label}\n${meta.definition}` : label;
                return new TreeNode(
                    label,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    element.connectionId,
                    element.database,
                    t.schema,
                    t.name,
                    new vscode.ThemeIcon('table'),
                    tooltip
                );
            }));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load tables: ${error}`);
            return [];
        }
    }

    private async getViews(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const views = await connector.getViews(element.database, element.schema);
            const connectionType = await this.getConnectionType(element.connectionId);
            return views.map(view => {
                // Show just the name if it's in the same schema we're browsing
                const displayName = (view.schema === element.schema) ? view.name : (view.schema ? `${view.schema}.${view.name}` : view.name);
                return new TreeNode(
                    displayName,
                    vscode.TreeItemCollapsibleState.None,
                    'view',
                    element.connectionId,
                    element.database,
                    view.schema,
                    view.name,
                    new vscode.ThemeIcon('eye')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load views: ${error}`);
            return [];
        }
    }

    private async getProcedures(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const procedures = await connector.getProcedures(element.database, element.schema);
            return procedures.map(proc => {
                const displayName = (proc.schema === element.schema) ? proc.name : (proc.schema ? `${proc.schema}.${proc.name}` : proc.name);
                return new TreeNode(
                    displayName,
                    vscode.TreeItemCollapsibleState.None,
                    'procedure',
                    element.connectionId,
                    element.database,
                    proc.schema,
                    proc.name,
                    new vscode.ThemeIcon('symbol-method')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load procedures: ${error}`);
            return [];
        }
    }

    private async getFunctions(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const functions = await connector.getFunctions(element.database, element.schema);
            return functions.map(func => {
                const displayName = (func.schema === element.schema) ? func.name : (func.schema ? `${func.schema}.${func.name}` : func.name);
                return new TreeNode(
                    displayName,
                    vscode.TreeItemCollapsibleState.None,
                    'function',
                    element.connectionId,
                    element.database,
                    func.schema,
                    func.name,
                    new vscode.ThemeIcon('symbol-function')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load functions: ${error}`);
            return [];
        }
    }

    private getTableChildren(element: TreeNode): TreeNode[] {
        return [
            new TreeNode(
                'Columns',
                vscode.TreeItemCollapsibleState.Collapsed,
                'columns',
                element.connectionId,
                element.database,
                element.schema,
                element.objectName,
                new vscode.ThemeIcon('symbol-field')
            ),
            new TreeNode(
                'Indexes',
                vscode.TreeItemCollapsibleState.Collapsed,
                'indexes',
                element.connectionId,
                element.database,
                element.schema,
                element.objectName,
                new vscode.ThemeIcon('list-ordered')
            ),
            new TreeNode(
                'Constraints',
                vscode.TreeItemCollapsibleState.Collapsed,
                'constraints',
                element.connectionId,
                element.database,
                element.schema,
                element.objectName,
                new vscode.ThemeIcon('shield')
            )
        ];
    }

    private async getColumns(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId || !element.objectName) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const columns = await connector.getColumns(element.objectName, element.schema, element.database);

            const tableMeta = await this.metadataStorage.getTableMetadata(
                element.connectionId,
                element.database,
                element.schema,
                element.objectName
            );
            const fields = tableMeta?.fields ?? {};

            return columns.map(col => {
                const fm = fields[col.name];
                const label = `${col.name} (${col.dataType})${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`;
                const extra: string[] = [];
                if (fm?.definition) extra.push(fm.definition);
                if (fm?.refersTo) extra.push(`refersTo: ${fm.refersTo}`);
                const tooltip = extra.length ? `${label}\n${extra.join('\n')}` : label;
                return new TreeNode(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'column',
                    element.connectionId,
                    element.database,
                    element.schema,
                    col.name,
                    new vscode.ThemeIcon('symbol-field'),
                    tooltip,
                    element.objectName
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load columns: ${error}`);
            return [];
        }
    }

    private async getIndexes(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId || !element.objectName) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const indexes = await connector.getIndexes(element.objectName, element.schema, element.database);
            return indexes.map(idx => {
                const label = `${idx.name} (${idx.columns.join(', ')})${idx.isUnique ? ' UNIQUE' : ''}`;
                return new TreeNode(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'index',
                    element.connectionId,
                    element.database,
                    element.schema,
                    idx.name,
                    new vscode.ThemeIcon('list-ordered')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load indexes: ${error}`);
            return [];
        }
    }

    private async getConstraints(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId || !element.objectName) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            return [];
        }

        try {
            const constraints = await connector.getConstraints(element.objectName, element.schema, element.database);
            return constraints.map(con => {
                const label = `${con.name} (${con.type})`;
                return new TreeNode(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'constraint',
                    element.connectionId,
                    element.database,
                    element.schema,
                    con.name,
                    new vscode.ThemeIcon('shield')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load constraints: ${error}`);
            return [];
        }
    }

    private getConnectionIcon(type: DatabaseType): vscode.Uri | vscode.ThemeIcon {
        const iconFile = (name: string) => vscode.Uri.joinPath(this.extensionUri, 'resources', name);
        switch (type) {
            case DatabaseType.MSSQL:
                return iconFile('icon-mssql.svg');
            case DatabaseType.PostgreSQL:
                return iconFile('icon-postgresql.svg');
            case DatabaseType.MySQL:
                return iconFile('icon-mysql.svg');
            default:
                return new vscode.ThemeIcon('database');
        }
    }
}
