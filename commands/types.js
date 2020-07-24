module.exports = {
	name: 'types',
    description: 'Returns a list of valid item types, for use with `!item search`',
    args: false,
	execute(message, args, db) {
        let rows = db.prepare("SELECT DISTINCT(type) AS type FROM items ORDER BY type").all();
        let msg = "The following types can be used in the `!item search` command (case sensitive):\n```"
        rows.forEach(row => {
            msg += row.type + "\n";
        });
        msg += "```";
        message.channel.send(msg);
    }
};
