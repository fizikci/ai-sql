# SQL Client Extension - Testing Checklist

## How to Test the Extension

### Starting the Extension
1. Open VS Code in the `ai-sql` folder
2. Press **F5** to launch Extension Development Host
3. A new VS Code window opens with the extension loaded

## ✅ Test Checklist

### 1. UI and Installation
- [ ] SQL Explorer icon appears in Activity Bar (left sidebar)
- [ ] Clicking icon opens "Connections" view
- [ ] View shows "+" and refresh icons in title bar

### 2. Connection Management

#### Adding a Connection
- [ ] Click "+" button
- [ ] Enter connection name (e.g., "Test DB")
- [ ] Select database type (SQL Server, PostgreSQL, or MySQL)
- [ ] Enter host (e.g., "localhost")
- [ ] Enter port (1433, 5432, or 3306)
- [ ] Enter username
- [ ] Enter password
- [ ] Optionally enter database name
- [ ] Connection is tested automatically
- [ ] Success message appears
- [ ] Connection appears in tree view

#### Editing a Connection
- [ ] Right-click on connection
- [ ] Select "Edit Connection"
- [ ] Change connection name
- [ ] Tree view updates with new name

#### Deleting a Connection
- [ ] Right-click on connection
- [ ] Select "Delete Connection"
- [ ] Confirmation dialog appears
- [ ] Click "Delete"
- [ ] Connection removed from tree view

#### Connect/Disconnect
- [ ] Right-click connection → "Connect"
- [ ] Connection name shows "●" prefix when connected
- [ ] Right-click connection → "Disconnect"
- [ ] "●" disappears

### 3. Database Explorer

#### Viewing Databases
- [ ] Expand connection node
- [ ] "Databases" node appears
- [ ] Expand "Databases"
- [ ] List of databases appears
- [ ] System databases are excluded

#### Viewing Tables
- [ ] "Tables" node visible under connection
- [ ] Expand "Tables"
- [ ] List of tables appears with schema names
- [ ] Table icons visible

#### Viewing Views
- [ ] "Views" node visible
- [ ] Expand to see database views
- [ ] Eye icon shown for views

#### Viewing Procedures
- [ ] "Procedures" node visible
- [ ] Expand to see stored procedures
- [ ] Method icon shown

#### Viewing Functions
- [ ] "Functions" node visible
- [ ] Expand to see database functions
- [ ] Function icon shown

#### Table Details
- [ ] Expand a table
- [ ] See "Columns", "Indexes", "Constraints" nodes
- [ ] Expand "Columns" to see all columns
- [ ] Column shows: name, data type, PK/FK indicators
- [ ] Expand "Indexes" to see indexes
- [ ] Expand "Constraints" to see constraints

### 4. Query Editor

#### Creating New Query
- [ ] Right-click connection → "New Query"
- [ ] New untitled SQL file opens
- [ ] SQL syntax highlighting works
- [ ] File contains "-- New Query" comment

#### Executing Full Query
- [ ] Write SQL query (e.g., `SELECT * FROM Users`)
- [ ] Don't select any text
- [ ] Click Play button (▶️) in editor title bar
- [ ] Query executes
- [ ] Results panel opens to the right
- [ ] Results show in table format

#### Executing Selected Query
- [ ] Write multiple SQL statements
- [ ] Select one statement
- [ ] Click Play button
- [ ] Only selected statement executes

#### Query Results Display
- [ ] Results show in table format
- [ ] Column headers visible
- [ ] Row count displayed
- [ ] Execution time shown
- [ ] NULL values show as "NULL" in different color
- [ ] Query text shown above results

### 5. Table Operations

#### View Table Data
- [ ] Right-click on table → "View Data"
- [ ] Results panel opens
- [ ] Top 1000 rows displayed
- [ ] All columns visible
- [ ] Message shown if more than 1000 rows

#### Edit Table
- [ ] Right-click on table → "Edit Table"
- [ ] New document opens
- [ ] Document shows:
  - [ ] Table name
  - [ ] All columns with types
  - [ ] All indexes
  - [ ] All constraints

### 6. Error Handling

#### Invalid Credentials
- [ ] Add connection with wrong password
- [ ] Error message appears
- [ ] Connection not saved

#### Connection Failure
- [ ] Add connection to non-existent server
- [ ] Appropriate error message shown

#### Invalid SQL
- [ ] Execute invalid SQL query
- [ ] Error message shown with details
- [ ] Results panel shows error

#### Not Connected
- [ ] Disconnect from database
- [ ] Try to execute query
- [ ] Warning/error message appears

### 7. Multi-Database Testing

If you have access to multiple database types, test with each:

#### SQL Server
- [ ] Connect to SQL Server
- [ ] Browse databases, tables, views
- [ ] Execute T-SQL queries
- [ ] View table data
- [ ] Check column data types
- [ ] View indexes and constraints

#### PostgreSQL
- [ ] Connect to PostgreSQL
- [ ] Browse databases, tables, views
- [ ] Execute PostgreSQL queries
- [ ] View table data
- [ ] Check column data types
- [ ] View indexes and constraints

#### MySQL
- [ ] Connect to MySQL
- [ ] Browse databases, tables, views
- [ ] Execute MySQL queries
- [ ] View table data
- [ ] Check column data types
- [ ] View indexes and constraints

### 8. Refresh Functionality
- [ ] Click refresh icon in view title
- [ ] Tree view updates
- [ ] New tables/objects appear if added externally

### 9. Performance Testing

#### Large Result Sets
- [ ] Execute query returning > 1000 rows
- [ ] Only 1000 rows displayed
- [ ] Warning message shown
- [ ] No performance issues

#### Many Connections
- [ ] Add 5+ connections
- [ ] All display correctly
- [ ] Can expand/collapse without issues

#### Deep Tree Navigation
- [ ] Expand connection → database → tables → table → columns
- [ ] No lag or performance issues

### 10. Edge Cases

#### Empty Database
- [ ] Connect to database with no tables
- [ ] "Tables" node expands with no items
- [ ] No errors occur

#### Special Characters
- [ ] Test with table names containing spaces
- [ ] Test with schema names
- [ ] Test with special characters in column names

#### Long Queries
- [ ] Execute very long query (100+ lines)
- [ ] Query executes successfully
- [ ] Results display correctly

## 🐛 Known Issues to Verify

### Expected Behavior
- [ ] pg-native warning in console is OK (optional dependency)
- [ ] First connection may take a moment to establish
- [ ] Large result sets limited to 1000 rows

### Should NOT Happen
- [ ] Extension crashes
- [ ] Connections disappear after restart
- [ ] Passwords lost
- [ ] Tree view doesn't update
- [ ] Cannot execute queries

## 📊 Test Results Template

```
Testing Date: ___________
VS Code Version: ___________
Extension Version: 0.0.1

✅ UI and Installation
✅ Connection Management
✅ Database Explorer
✅ Query Editor
✅ Table Operations
✅ Error Handling
✅ SQL Server Support
✅ PostgreSQL Support
✅ MySQL Support
✅ Refresh Functionality
✅ Performance
✅ Edge Cases

Issues Found:
1. ___________
2. ___________

Overall Status: ✅ PASS / ⚠️ ISSUES / ❌ FAIL
```

## 🚀 Ready for Production?

All items checked? Congratulations! Your extension is ready to:
- [ ] Package with `vsce package`
- [ ] Share with team
- [ ] Publish to marketplace
- [ ] Deploy to production

---

**Happy Testing! 🧪**
