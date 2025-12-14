# SQL Client VS Code Extension - Architecture

## Project Structure

```
ai-sql/
├── .github/
│   └── copilot-instructions.md
├── .vscode/
│   ├── extensions.json
│   ├── launch.json          # Debug configuration
│   ├── settings.json
│   └── tasks.json           # Build tasks
├── resources/
│   └── database.svg         # Activity bar icon
├── src/
│   ├── commands/
│   │   └── CommandHandler.ts       # All command implementations
│   ├── connectors/
│   │   ├── IDatabaseConnector.ts   # Interface for database connectors
│   │   ├── MSSQLConnector.ts       # SQL Server implementation
│   │   ├── PostgreSQLConnector.ts  # PostgreSQL implementation
│   │   ├── MySQLConnector.ts       # MySQL implementation
│   │   └── ConnectorFactory.ts     # Factory pattern for connectors
│   ├── managers/
│   │   └── ConnectionManager.ts    # Manages active connections
│   ├── models/
│   │   └── connection.ts           # Data models and types
│   ├── providers/
│   │   ├── SqlExplorerProvider.ts  # Tree view provider
│   │   └── QueryResultProvider.ts  # Query results webview
│   ├── storage/
│   │   └── connectionStorage.ts    # Persist connections
│   └── extension.ts                # Extension entry point
├── dist/                    # Compiled output (webpack)
├── node_modules/            # Dependencies
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript configuration
├── webpack.config.js        # Webpack bundling config
└── README.md               # Documentation

```

## Key Components

### 1. Extension Entry (`extension.ts`)
- Initializes all services
- Registers commands
- Creates tree view
- Sets up event handlers

### 2. Connection Management
- **ConnectionStorage**: Persists connections in VS Code global state
- **ConnectionManager**: Manages active database connections (singleton)
- **ConnectorFactory**: Creates appropriate connector based on database type

### 3. Database Connectors
Each connector implements `IDatabaseConnector` interface:
- Connect/disconnect operations
- Query execution
- Metadata retrieval (databases, tables, views, procedures, functions)
- Schema information (columns, indexes, constraints)

### 4. Tree View Provider (`SqlExplorerProvider`)
- Displays hierarchical database structure
- Shows connections with vendor icons
- Expands to show databases → tables → columns/indexes/constraints
- Refresh functionality

### 5. Query Results (`QueryResultProvider`)
- Displays query results in webview
- Formatted HTML table
- Execution time tracking
- NULL value indicators

### 6. Command Handler
Implements all user commands:
- Add/Edit/Delete connections
- Connect/Disconnect
- New query
- Execute query
- View table data
- Edit table structure

## Data Flow

```
User Action → Command Handler → Connection Manager → Database Connector → Database
                    ↓                                         ↓
            Tree View Provider                      Query Result Provider
                    ↓                                         ↓
              VS Code UI                            Webview Panel
```

## Database Driver Dependencies

- **mssql**: Microsoft SQL Server native driver
- **pg**: PostgreSQL native driver  
- **mysql2**: MySQL/MariaDB driver with Promise support

## Build Process

1. TypeScript compilation (`tsc`)
2. Webpack bundling (reduces extension size)
3. Source maps generation for debugging

## Extension Contributions

- **Activity Bar**: Custom "SQL Explorer" view container
- **Tree View**: "Connections" view
- **Commands**: 11 commands for database operations
- **Menus**: Context menus for tree items and editor
- **Language**: SQL file support

## Design Patterns Used

- **Factory Pattern**: ConnectorFactory creates database-specific connectors
- **Singleton Pattern**: ConnectionManager ensures single instance
- **Provider Pattern**: TreeDataProvider for VS Code tree view
- **Command Pattern**: Separate command handlers for each action

## Security Considerations

- Passwords stored in VS Code global state (encrypted by VS Code)
- SSL/TLS support for encrypted connections
- No logging of sensitive information
- Connection testing before saving credentials
