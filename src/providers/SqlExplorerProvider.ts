import * as vscode from 'vscode';
import { ConnectionConfig, DatabaseType } from '../models/connection';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';

export class TreeNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly connectionId?: string,
        public readonly database?: string,
        public readonly schema?: string,
        public readonly objectName?: string,
        iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri }
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        if (iconPath) {
            this.iconPath = iconPath;
        }
    }
}

export class SqlExplorerProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = 
        new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager
    ) {}

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
                // Connection/server level: only list databases. Other categories require a specific database context.
                return this.getConnectionCategories(element);
            case 'databases':
                return this.getDatabases(element);
            case 'database':
                // Database level: show object categories for the selected database.
                return this.getDatabaseObjectCategories(element);
            case 'tables':
                return this.getTables(element);
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
            const label = isConnected ? `● ${conn.name}` : conn.name;
            
            return new TreeNode(
                label,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                conn.id,
                undefined,
                undefined,
                undefined,
                icon
            );
        });
    }

    private getConnectionCategories(element: TreeNode): TreeNode[] {
        return [
            new TreeNode(
                'Databases',
                vscode.TreeItemCollapsibleState.Collapsed,
                'databases',
                element.connectionId,
                undefined,
                undefined,
                undefined,
                new vscode.ThemeIcon('database')
            )
        ];
    }

    private getDatabaseObjectCategories(element: TreeNode): TreeNode[] {
        // Defensive: if for some reason we don't have a database name, don't show object categories.
        if (!element.database) {
            return [];
        }

        return [
            new TreeNode(
                'Tables',
                vscode.TreeItemCollapsibleState.Collapsed,
                'tables',
                element.connectionId,
                element.database,
                undefined,
                undefined,
                new vscode.ThemeIcon('table')
            ),
            new TreeNode(
                'Views',
                vscode.TreeItemCollapsibleState.Collapsed,
                'views',
                element.connectionId,
                element.database,
                undefined,
                undefined,
                new vscode.ThemeIcon('eye')
            ),
            new TreeNode(
                'Procedures',
                vscode.TreeItemCollapsibleState.Collapsed,
                'procedures',
                element.connectionId,
                element.database,
                undefined,
                undefined,
                new vscode.ThemeIcon('symbol-method')
            ),
            new TreeNode(
                'Functions',
                vscode.TreeItemCollapsibleState.Collapsed,
                'functions',
                element.connectionId,
                element.database,
                undefined,
                undefined,
                new vscode.ThemeIcon('symbol-function')
            )
        ];
    }

    private async getDatabases(element: TreeNode): Promise<TreeNode[]> {
        if (!element.connectionId) {
            return [];
        }

        const connector = this.connectionManager.getConnection(element.connectionId);
        if (!connector) {
            console.log('[SqlExplorer] No connector found for:', element.connectionId);
            return [];
        }

        try {
            console.log('[SqlExplorer] Getting databases...');
            const databases = await connector.getDatabases();
            console.log('[SqlExplorer] Found databases:', databases);
            return databases.map(db => 
                new TreeNode(
                    db,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'database',
                    element.connectionId,
                    db,
                    undefined,
                    undefined,
                    new vscode.ThemeIcon('database')
                )
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load databases: ${error}`);
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
            const tables = await connector.getTables(element.database);
            return tables.map(table => 
                new TreeNode(
                    table.schema ? `${table.schema}.${table.name}` : table.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    element.connectionId,
                    element.database,
                    table.schema,
                    table.name,
                    new vscode.ThemeIcon('table')
                )
            );
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
            const views = await connector.getViews(element.database);
            return views.map(view => 
                new TreeNode(
                    view.schema ? `${view.schema}.${view.name}` : view.name,
                    vscode.TreeItemCollapsibleState.None,
                    'view',
                    element.connectionId,
                    element.database,
                    view.schema,
                    view.name,
                    new vscode.ThemeIcon('eye')
                )
            );
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
            const procedures = await connector.getProcedures(element.database);
            return procedures.map(proc => 
                new TreeNode(
                    proc.schema ? `${proc.schema}.${proc.name}` : proc.name,
                    vscode.TreeItemCollapsibleState.None,
                    'procedure',
                    element.connectionId,
                    element.database,
                    proc.schema,
                    proc.name,
                    new vscode.ThemeIcon('symbol-method')
                )
            );
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
            const functions = await connector.getFunctions(element.database);
            return functions.map(func => 
                new TreeNode(
                    func.schema ? `${func.schema}.${func.name}` : func.name,
                    vscode.TreeItemCollapsibleState.None,
                    'function',
                    element.connectionId,
                    element.database,
                    func.schema,
                    func.name,
                    new vscode.ThemeIcon('symbol-function')
                )
            );
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
            const columns = await connector.getColumns(element.objectName, element.schema);
            return columns.map(col => {
                const label = `${col.name} (${col.dataType})${col.isPrimaryKey ? ' PK' : ''}${col.isForeignKey ? ' FK' : ''}`;
                return new TreeNode(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'column',
                    element.connectionId,
                    element.database,
                    element.schema,
                    col.name,
                    new vscode.ThemeIcon('symbol-field')
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
            const indexes = await connector.getIndexes(element.objectName, element.schema);
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
            const constraints = await connector.getConstraints(element.objectName, element.schema);
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

    private getConnectionIcon(type: DatabaseType): vscode.ThemeIcon {
        switch (type) {
            case DatabaseType.MSSQL:
                return new vscode.ThemeIcon('server');
            case DatabaseType.PostgreSQL:
                return new vscode.ThemeIcon('server-process');
            case DatabaseType.MySQL:
                return new vscode.ThemeIcon('server-environment');
            default:
                return new vscode.ThemeIcon('database');
        }
    }
}
