# Developer Guide - Extending the SQL Client

## Adding a New Database Type

Want to add support for Oracle, MongoDB, or another database? Follow these steps:

### 1. Update the DatabaseType Enum
**File**: `src/models/connection.ts`

```typescript
export enum DatabaseType {
    MSSQL = 'mssql',
    PostgreSQL = 'postgresql',
    MySQL = 'mysql',
    Oracle = 'oracle'  // Add your new type
}
```

### 2. Create a New Connector
**File**: `src/connectors/OracleConnector.ts`

```typescript
import { IDatabaseConnector } from './IDatabaseConnector';
// ... implement all interface methods
```

Follow the pattern in `MSSQLConnector.ts`, `PostgreSQLConnector.ts`, or `MySQLConnector.ts`.

### 3. Update the Factory
**File**: `src/connectors/ConnectorFactory.ts`

```typescript
case DatabaseType.Oracle:
    return new OracleConnector(config);
```

### 4. Update the Connection Dialog
**File**: `src/commands/CommandHandler.ts`

```typescript
const typeOptions = [
    { label: 'SQL Server', value: DatabaseType.MSSQL },
    { label: 'PostgreSQL', value: DatabaseType.PostgreSQL },
    { label: 'MySQL', value: DatabaseType.MySQL },
    { label: 'Oracle', value: DatabaseType.Oracle }  // Add here
];
```

### 5. Add Default Port
```typescript
private getDefaultPort(type: DatabaseType): number {
    switch (type) {
        // ... existing cases
        case DatabaseType.Oracle:
            return 1521;
    }
}
```

## Adding a New Command

### 1. Register in package.json
```json
{
  "command": "sql-client.myNewCommand",
  "title": "My New Command",
  "icon": "$(symbol-method)"
}
```

### 2. Add Menu Item (if needed)
```json
{
  "command": "sql-client.myNewCommand",
  "when": "view == sqlExplorer && viewItem == table",
  "group": "navigation"
}
```

### 3. Implement in CommandHandler
**File**: `src/commands/CommandHandler.ts`

```typescript
async myNewCommand(node: TreeNode): Promise<void> {
    // Your implementation
}
```

### 4. Register in extension.ts
**File**: `src/extension.ts`

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('sql-client.myNewCommand', (node) => 
        commandHandler.myNewCommand(node)
    )
);
```

## Adding a New Tree View Item Type

### 1. Update contextValue
In `SqlExplorerProvider.ts`, add a new case to `getChildren()`:

```typescript
case 'myNewType':
    return this.getMyNewItems(element);
```

### 2. Create Getter Method
```typescript
private async getMyNewItems(element: TreeNode): Promise<TreeNode[]> {
    // Fetch and return items
    return items.map(item => 
        new TreeNode(
            item.name,
            vscode.TreeItemCollapsibleState.None,
            'myNewItem',
            element.connectionId,
            element.database,
            element.schema,
            item.name,
            new vscode.ThemeIcon('symbol-field')
        )
    );
}
```

## Customizing Query Results Display

### Modify the Webview
**File**: `src/providers/QueryResultProvider.ts`

The `getWebviewContent()` method returns HTML. Customize:
- CSS styles
- Table layout
- Add charts or visualizations
- Export buttons

Example - Add export button:
```typescript
<button onclick="exportToCSV()">Export to CSV</button>
<script>
    function exportToCSV() {
        // Implementation
    }
</script>
```

## Adding Database-Specific SQL Syntax

### Create Syntax Helpers
**File**: `src/utils/sqlGenerator.ts`

```typescript
export class SqlGenerator {
    static getTopClause(type: DatabaseType, limit: number): string {
        switch (type) {
            case DatabaseType.MSSQL:
                return `TOP ${limit}`;
            case DatabaseType.PostgreSQL:
            case DatabaseType.MySQL:
                return `LIMIT ${limit}`;
        }
    }
}
```

## Improving Error Handling

### Custom Error Types
**File**: `src/models/errors.ts`

```typescript
export class DatabaseConnectionError extends Error {
    constructor(message: string, public readonly dbType: DatabaseType) {
        super(message);
        this.name = 'DatabaseConnectionError';
    }
}
```

### Use in Connectors
```typescript
throw new DatabaseConnectionError(
    'Failed to connect',
    DatabaseType.MSSQL
);
```

## Adding Configuration Settings

### 1. Define in package.json
```json
"contributes": {
    "configuration": {
        "title": "SQL Client",
        "properties": {
            "sqlClient.maxRows": {
                "type": "number",
                "default": 1000,
                "description": "Maximum rows to display"
            }
        }
    }
}
```

### 2. Read in Code
```typescript
const config = vscode.workspace.getConfiguration('sqlClient');
const maxRows = config.get<number>('maxRows', 1000);
```

## Testing Your Changes

### Manual Testing
1. Press F5 to launch Extension Development Host
2. Open SQL Explorer
3. Test your new feature
4. Check console for errors (Help → Toggle Developer Tools)

### Adding Unit Tests
**File**: `src/test/connector.test.ts`

```typescript
import * as assert from 'assert';
import { MSSQLConnector } from '../connectors/MSSQLConnector';

suite('MSSQL Connector Tests', () => {
    test('Connection Config', () => {
        // Test implementation
    });
});
```

## Debugging Tips

### Use Console Logging
```typescript
console.log('[SQL Client]', 'Debug message', variable);
```

### Set Breakpoints
1. Add breakpoint in VS Code
2. Press F5
3. Trigger the code path
4. Inspect variables

### Check Output Channel
```typescript
const outputChannel = vscode.window.createOutputChannel('SQL Client');
outputChannel.appendLine('Debug info');
outputChannel.show();
```

## Performance Optimization

### Lazy Loading
Load data only when needed:
```typescript
if (element.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed) {
    return []; // Don't fetch children until expanded
}
```

### Caching
```typescript
private cache: Map<string, any[]> = new Map();

async getItems(key: string): Promise<any[]> {
    if (this.cache.has(key)) {
        return this.cache.get(key)!;
    }
    const items = await this.fetchItems();
    this.cache.set(key, items);
    return items;
}
```

## Code Style Guidelines

### TypeScript Best Practices
- Use `async/await` instead of promises
- Always type function parameters and return values
- Use `const` for immutable values
- Use interfaces for data structures
- Avoid `any` type - use specific types

### Naming Conventions
- Classes: PascalCase (`MSSQLConnector`)
- Methods: camelCase (`getConnection`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_PORT`)
- Files: PascalCase for classes, camelCase for utilities

### Comment Guidelines
```typescript
/**
 * Connects to a database using the provided configuration.
 * @param config Connection configuration
 * @throws DatabaseConnectionError if connection fails
 * @returns Promise that resolves when connected
 */
async connect(config: ConnectionConfig): Promise<void> {
    // Implementation
}
```

## Building for Production

### 1. Update Version
**package.json**
```json
"version": "0.1.0"
```

### 2. Update Changelog
**CHANGELOG.md**
```markdown
## [0.1.0] - 2025-12-14
### Added
- New feature X
```

### 3. Compile for Production
```bash
npm run package
```

### 4. Create VSIX
```bash
npm install -g @vscode/vsce
vsce package
```

## Publishing to Marketplace

### 1. Create Publisher
Visit: https://marketplace.visualstudio.com/manage

### 2. Update package.json
```json
"publisher": "your-publisher-id"
```

### 3. Publish
```bash
vsce publish
```

## Contributing Guidelines

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Update documentation
6. Submit pull request

## Getting Help

- Check existing code for patterns
- Review VS Code API docs: https://code.visualstudio.com/api
- Check database driver docs (mssql, pg, mysql2)
- Look at similar VS Code extensions

---

Happy coding! 🚀
