# SQL Client for VS Code

A comprehensive SQL Client extension for Visual Studio Code that supports SQL Server, PostgreSQL, and MySQL databases.

## Features

### 🔌 Multi-Database Support
- **SQL Server** - Full support for Microsoft SQL Server
- **PostgreSQL** - Complete PostgreSQL integration
- **MySQL** - MySQL and MariaDB compatibility

### 🌲 Tree View Explorer
- Visual database explorer in the sidebar
- Browse connections, databases, tables, views, procedures, and functions
- Expand tables to see:
  - Columns with data types
  - Indexes
  - Constraints (Primary Keys, Foreign Keys, Unique, Check)

### 📝 Query Editor
- Write and execute SQL queries
- Syntax highlighting for SQL
- Execute selected query or entire document
- View results in a formatted table

### 🔧 Connection Management
- Add multiple database connections
- Edit connection details
- Connect/Disconnect from databases
- Secure password storage
- Test connections before saving

### 📊 Data Viewing
- View table data (top 1000 rows)
- Formatted result display
- Execution time tracking
- Column headers and null value indicators

## Installation

1. Install the extension from the VS Code Marketplace (or VSIX file)
2. Open the SQL Explorer view from the Activity Bar
3. Click "Add Connection" to get started

## Usage

### Adding a Connection

1. Click the **+** icon in the SQL Explorer view
2. Enter connection details:
   - Connection name
   - Database type (SQL Server, PostgreSQL, MySQL)
   - Host address
   - Port number
   - Username
   - Password
   - Database name (optional)
3. Connection will be tested automatically

### Executing Queries

1. Right-click on a connection or database → **New Query**
2. Write your SQL query
3. Select the query text (optional - runs entire document if nothing selected)
4. Click the **Execute** button or press the play icon
5. Results appear in a new panel

### Browsing Database Objects

- Click on connections to expand and view databases
- Browse Tables, Views, Procedures, and Functions
- Expand tables to see structure details
- Right-click on tables to view data or edit structure

## Keyboard Shortcuts

- **Execute Query**: Click the play icon in editor title bar

## Requirements

- Visual Studio Code 1.107.0 or higher
- Network access to your database servers

## Database Drivers

This extension uses the following npm packages:
- `mssql` - SQL Server driver
- `pg` - PostgreSQL driver
- `mysql2` - MySQL driver

## Extension Settings

Currently, all settings are managed through the connection dialog.

## Known Issues

- Large result sets are limited to 1000 rows in the viewer
- Some advanced SQL Server features may require additional configuration

## Roadmap

- [ ] Export query results to CSV/JSON
- [ ] Query history
- [ ] Autocomplete for SQL keywords and table names
- [ ] Schema comparison tools
- [ ] Database diagram viewer
- [ ] Multiple query result tabs
- [ ] Dark/Light theme support for result viewer

## Development

### Building from Source

```bash
npm install
npm run compile
```

### Running in Debug Mode

1. Press F5 to open Extension Development Host
2. The extension will be loaded in the new window

### Running Tests

```bash
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

[MIT](LICENSE)

## Release Notes

### 0.0.1

Initial release:
- Multi-database support (SQL Server, PostgreSQL, MySQL)
- Tree view explorer
- Query editor with execution
- Connection management
- Table data viewing
- Database object browsing

---

**Enjoy using SQL Client!**

