export interface FieldMetadata {
    /** Short definition of the field */
    definition?: string;
    /** If true, field will be displayed by default in View Data */
    viewInList?: boolean;
    /** If field references another table, contains tableName.pkFieldName (or schema.table.pkFieldName) */
    refersTo?: string;
}

export interface TableMetadata {
    /** Group name for explorer grouping. Defaults to "Others" when not present. */
    group?: string;
    /** Short definition of the table */
    definition?: string;
    /** Per-field metadata */
    fields?: Record<string, FieldMetadata>;
}

export interface DatabaseMetadata {
    /** Keyed by fully-qualified table name: "schema.table" or "table" */
    tables?: Record<string, TableMetadata>;
}

export interface ConnectionMetadata {
    /** Keyed by database name; use "__default__" when no DB name */
    databases?: Record<string, DatabaseMetadata>;
}

export interface MetadataFile {
    version: 1;
    connections: Record<string, ConnectionMetadata>;
}
