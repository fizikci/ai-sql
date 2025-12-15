export type SqlGuardrailResult = {
    isSelectOnly: boolean;
    reason?: string;
};

function stripLeadingComments(sql: string): string {
    let s = sql;

    // Iteratively remove whitespace + leading comments.
    while (true) {
        const before = s;
        s = s.replace(/^\s+/, '');

        // -- line comments
        s = s.replace(/^--[^\n]*\n?/, '');

        // /* block comments */
        s = s.replace(/^\/\*[\s\S]*?\*\//, '');

        if (s === before) {
            break;
        }
    }

    return s;
}

function stripQuotedLiterals(sql: string): string {
    // Replace the contents of quoted literals/identifiers with spaces to avoid
    // false positives when scanning for keywords or statement separators.
    let out = '';
    let i = 0;

    type Mode = 'normal' | 'single' | 'double' | 'backtick' | 'bracket';
    let mode: Mode = 'normal';

    while (i < sql.length) {
        const ch = sql[i];

        if (mode === 'normal') {
            if (ch === "'") {
                mode = 'single';
                out += ' ';
                i++;
                continue;
            }
            if (ch === '"') {
                mode = 'double';
                out += ' ';
                i++;
                continue;
            }
            if (ch === '`') {
                mode = 'backtick';
                out += ' ';
                i++;
                continue;
            }
            if (ch === '[') {
                mode = 'bracket';
                out += ' ';
                i++;
                continue;
            }

            out += ch;
            i++;
            continue;
        }

        // Inside single-quoted string: '' escapes.
        if (mode === 'single') {
            if (ch === "'") {
                if (sql[i + 1] === "'") {
                    out += '  ';
                    i += 2;
                    continue;
                }
                mode = 'normal';
                out += ' ';
                i++;
                continue;
            }
            out += ' ';
            i++;
            continue;
        }

        // Inside double-quoted identifier/string: "" escapes.
        if (mode === 'double') {
            if (ch === '"') {
                if (sql[i + 1] === '"') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                mode = 'normal';
                out += ' ';
                i++;
                continue;
            }
            out += ' ';
            i++;
            continue;
        }

        // Inside MySQL backtick identifier: `` escapes.
        if (mode === 'backtick') {
            if (ch === '`') {
                if (sql[i + 1] === '`') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                mode = 'normal';
                out += ' ';
                i++;
                continue;
            }
            out += ' ';
            i++;
            continue;
        }

        // Inside SQL Server [bracket] identifier: ]] escapes.
        if (mode === 'bracket') {
            if (ch === ']') {
                if (sql[i + 1] === ']') {
                    out += '  ';
                    i += 2;
                    continue;
                }
                mode = 'normal';
                out += ' ';
                i++;
                continue;
            }
            out += ' ';
            i++;
            continue;
        }
    }

    return out;
}

function hasMultipleStatements(sqlWithoutLiterals: string): boolean {
    const s = sqlWithoutLiterals;
    const semi = s.indexOf(';');
    if (semi === -1) {
        return false;
    }

    // Allow a single trailing semicolon with only whitespace after.
    const first = semi;
    const rest = s.slice(first + 1);
    if (rest.trim().length === 0) {
        return false;
    }

    // Any non-whitespace after first semicolon => multiple statements.
    return true;
}

export function checkSelectOnly(sql: string): SqlGuardrailResult {
    const original = String(sql ?? '');
    const withoutLeadingComments = stripLeadingComments(original);
    if (!withoutLeadingComments.trim()) {
        return { isSelectOnly: false, reason: 'Empty SQL.' };
    }

    const withoutLiterals = stripQuotedLiterals(withoutLeadingComments);

    if (hasMultipleStatements(withoutLiterals)) {
        return { isSelectOnly: false, reason: 'Multiple statements detected.' };
    }

    const head = withoutLiterals.trimStart().toLowerCase();
    const startsOk = head.startsWith('select') || head.startsWith('with');
    if (!startsOk) {
        return { isSelectOnly: false, reason: 'Statement is not a SELECT.' };
    }

    // Conservative deny-list of non-read-only keywords.
    // Note: we scan the entire statement (sans literals) because CTEs can still
    // include DML and some dialects allow SELECT ... INTO / FOR UPDATE.
    const forbidden = /(\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|exec|execute|call|do|set|use|begin|commit|rollback|savepoint|vacuum|analyze|replace)\b)/i;
    const m1 = withoutLiterals.match(forbidden);
    if (m1) {
        return { isSelectOnly: false, reason: `Forbidden keyword detected: ${m1[1]}.` };
    }

    // SQL Server (and others) allow SELECT ... INTO to create a table.
    if (/\bselect\b[\s\S]*\binto\b/i.test(withoutLiterals)) {
        return { isSelectOnly: false, reason: 'SELECT INTO detected (can create objects).' };
    }

    // Locking reads.
    if (/\bfor\s+update\b/i.test(withoutLiterals)) {
        return { isSelectOnly: false, reason: 'FOR UPDATE detected.' };
    }

    return { isSelectOnly: true };
}
