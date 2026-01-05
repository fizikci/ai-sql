# Change Log

All notable changes to the "SQL with AI" extension will be documented in this file.

## [0.1.5] - 2026-01-04

### Added
- Multi-schema support across all database types
- Schema-level hierarchy in SQL Explorer tree (Databases → Schemas → Objects)
- `getSchemas()` method for all database connectors

### Changed
- Updated table display to hide schema prefix when browsing within schema context
- PostgreSQL connector now properly switches database context for queries
- All database connectors support database parameter for getColumns, getIndexes, getConstraints, getTableDetails
- ViewDataProvider and AggregateDataProvider now handle PostgreSQL database switching

### Fixed
- PostgreSQL now lists all schemas (not just 'public')
- View Data and Aggregate Data commands now work correctly across different databases
- Table names no longer show redundant schema prefix in tree view

## [0.1.4] - 2025-12-27

### Added
- Aggregate data functionality for analyzing table data
- Aggregate commands for both table-level and field-level aggregation
- Interactive aggregate data viewer with customizable aggregations (COUNT, SUM, AVG, MIN, MAX)
- Support for GROUP BY operations in aggregate view

## [0.1.3] - 2025-12-27

### Added
- Table management commands (rename, drop tables)
- View management commands (rename, drop views)
- Column management commands (rename, drop columns)
- Context menu actions for database objects

## [0.1.2] - 2025-12-20

### Added
- Auto-connect on New Query command
- Auto-connect explorer on expand functionality
- Automatic connection establishment when interacting with database objects

### Changed
- Improved user experience with automatic connection handling

## [0.1.1] - 2025-12-15

### Added
- Table grouping functionality in SQL Explorer
- Drag-and-drop support for organizing tables into groups
- Metadata storage for table groups and field definitions
- ViewDataProvider for interactive table data browsing
- Column selection and filtering in data views
- Sort and limit controls for table data
- Enhanced metadata handling for table and field metadata

### Changed
- Improved tree view with collapsible table groups

## [0.1.0] - 2025-12-14

### Added
- AI SQL chat participant with natural language query capabilities
- Intent classification for user queries
- Schema context service for AI query generation
- Active database context management
- SQL guardrails to enforce SELECT-only queries for safety
- Support for column metadata and definitions
- PostgreSQL string array normalization

### Changed
- Enhanced SqlExplorerProvider to determine connection type and format table labels
- Improved query handling in CommandHandler
- Better database-specific formatting (e.g., hiding 'dbo.' prefix in SQL Server)

### Fixed
- SQL injection protection with guardrails
- Improved error handling for query execution

## [0.0.1] - 2025-12-13

### Added
- Initial release of SQL Client extension
- Support for SQL Server, PostgreSQL, and MySQL databases
- Connection management (add, edit, delete connections)
- Tree view explorer for browsing database objects
- Query editor with SQL syntax highlighting
- Execute queries and view results in formatted table
- Browse databases, tables, views, procedures, and functions
- View table structure (columns, indexes, constraints)
- View table data (top 1000 rows)
- Connect/disconnect from databases
- Vendor-specific icons for different database types
- Secure connection storage
- Connection testing before saving
- Query execution time tracking
- NULL value indicators in results
- Multiple connection support
