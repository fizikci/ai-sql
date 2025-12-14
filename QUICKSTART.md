# SQL Client - Quick Start Guide

## Getting Started in 3 Minutes

### Step 1: Open SQL Explorer

1. Look for the **Database icon** in the Activity Bar (left sidebar)
2. Click it to open the SQL Explorer view

### Step 2: Add Your First Connection

1. Click the **+** button in the SQL Explorer title bar
2. Fill in the connection details:

   **For SQL Server:**
   ```
   Name: My SQL Server
   Type: SQL Server
   Host: localhost
   Port: 1433
   Username: sa
   Password: YourPassword
   Database: (optional)
   ```

   **For PostgreSQL:**
   ```
   Name: My Postgres
   Type: PostgreSQL
   Host: localhost
   Port: 5432
   Username: postgres
   Password: YourPassword
   Database: postgres
   ```

   **For MySQL:**
   ```
   Name: My MySQL
   Type: MySQL
   Host: localhost
   Port: 3306
   Username: root
   Password: YourPassword
   Database: (optional)
   ```

3. Click through the prompts - the connection will be tested automatically
4. If successful, your connection appears in the tree view!

### Step 3: Browse Your Database

1. **Expand the connection** to see databases
2. **Expand a database** to see:
   - Tables
   - Views
   - Procedures
   - Functions

3. **Expand a table** to see:
   - Columns (with data types)
   - Indexes
   - Constraints

### Step 4: Execute Your First Query

**Method 1: From Tree View**
1. Right-click on a connection or database
2. Select **"New Query"**
3. Type your SQL query:
   ```sql
   SELECT * FROM Users
   WHERE active = 1
   ORDER BY created_date DESC
   ```
4. Click the **Play button** (▶️) in the editor title bar
5. Results appear in a new panel!

**Method 2: Open SQL File**
1. Create a new file with `.sql` extension
2. Write your query
3. Click the **Play button** (▶️)
4. Select which connection to use

### Step 5: View Table Data

1. Find a table in the tree view
2. Right-click on it
3. Select **"View Data"**
4. Top 1000 rows appear in the results panel

## Tips & Tricks

### Execute Part of a Query
- Select the SQL you want to run
- Click the Play button
- Only the selected text will execute

### Multiple Connections
- Add as many connections as you need
- Each connection appears separately in the tree
- Switch between them easily

### Connection Status
- **● Connection Name** = Currently connected
- **Connection Name** = Not connected
- Right-click to connect/disconnect

### Refresh
- Click the **refresh icon** to update the tree view
- Useful after creating new tables or modifying schema

### Keyboard Shortcuts
- Select query text and click Play button to execute

## Common Tasks

### Creating a New Table
```sql
-- SQL Server
CREATE TABLE Customers (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255)
)

-- PostgreSQL
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255)
)

-- MySQL
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255)
)
```

### Viewing Table Structure
1. Expand table in tree view
2. See all columns, indexes, and constraints
3. Or right-click → **"Edit Table"** for full schema script

### Running Multiple Queries
```sql
-- Run each statement separately by selecting it
SELECT COUNT(*) FROM Users;

SELECT * FROM Users WHERE active = 1;

SELECT TOP 10 * FROM Orders ORDER BY order_date DESC;
```

## Troubleshooting

### "Failed to connect"
- Check host and port are correct
- Verify username and password
- Ensure database server is running
- Check firewall allows connections

### "Not connected to database"
- Right-click connection → **"Connect"**
- Or click the plug icon

### "Query execution failed"
- Check SQL syntax for your database type
- Verify table/column names exist
- Check you have necessary permissions

### Empty tree view
- Click the refresh button
- Disconnect and reconnect
- Check database actually has objects

## Next Steps

- Browse the full [README](README.md) for all features
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- Submit issues or feature requests on GitHub

---

**Happy Querying! 🎉**
