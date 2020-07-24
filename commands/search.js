module.exports = {
	name: 'search',
    description: 'Finds items containing the text you provide (case insensitive). The search string can be enclosed in quotation marks and can include the SQL wildcards `%` and `_`. The type constraint can be a comma-delimited string of multiple valid types (see `!item types` command).',
    args: true,
    usage: "<search string> [type=<valid item type>[,<valid item type>...]]",
	execute(message, args, db) {
        let search, types;
        const argstring = args.join(' ');
        // First check if type constraint is given
        if (argstring.includes(' type=')) {
            let idx = argstring.indexOf(' type=');
            typestr = argstring.slice(idx + 6);
            types = typestr.split(',');
            search = argstring.slice(0,idx);
        } else {
            search = argstring;
        }

        if ( (!search.includes('%')) && (! search.includes('_'))) {
            search = '%' + search + '%';
        }

        let rows;
        if (types === undefined) {
            rows = db.prepare("SELECT * FROM items WHERE name LIKE ? ORDER BY name COLLATE NOCASE").all(search);
        } else {
            // rows = db.prepare("SELECT * FROM items WHERE type IN ["+  +"] AND name LIKE ? ORDER BY name COLLATE NOCASE").all(search);
            const stmt = db.prepare("SELECT * FROM items WHERE type=? and name LIKE ? ORDER BY name COLLATE NOCASE");
            const collated = types.map(type => stmt.all(type, search));
            rows = []
            collated.forEach(set => {
                set.forEach(rec => {
                    if (! rows.some(x => x.id === rec.id)) {
                        rows.push(rec);
                    }
                });
            });
            rows.sort((a,b) => {
                return a.name.localeCompare(b.name);
            })
        }
        if (rows.length === 0) {
            if (types !== undefined) {
                message.channel.send("No matching records were found. Make sure your type constraint is valid (use `!item types` command).");
            } else {
                message.channel.send("No matching records were found.");
            }
        } else {
            let toolong = false;
            let msg = "Found " + rows.length + " matching records:\n```";
            rows.forEach(rec => {
                if (msg.length > 1900) {
                    toolong = true;
                } else {
                    let row = rec.name + " (" + rec.id + "), " + rec.type + "\n";
                    msg += row;
                }
            });
            msg += "```";
            if (toolong) {
                msg += "*Truncated. Please narrow your search.*"
            }
            message.channel.send(msg);
        }
    }
};
