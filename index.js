const fs = require('fs');
const Discord = require('discord.js');
const config = require('./config.json');
const { argparse } = require ('./lib/argparse');

// Initialize Discord Bot
var bot = new Discord.Client();
bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	bot.commands.set(command.name, command);
}

// Establish global vars
var db;

bot.once('ready', function (evt) {
    console.log('Connected');
    console.log("Initializing database");
    db = require('better-sqlite3')('./db/items.db', { fileMustExist: true });
});

bot.on('message', message => {
	if (!message.content.startsWith(config.prefix) || message.author.bot) return;

    // const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const args = argparse(message.content.slice(config.prefix.length).trim());
	const commandName = args.shift().toLowerCase();

    const command = bot.commands.get(commandName)
        || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;    

    if (command.args && !args.length) {
        return message.channel.send(`You didn't provide any arguments, ${message.author}!`);
    }

    try {
        command.execute(message, args, db);
    } catch (error) {
        console.error(error);
        message.reply('there was an error trying to execute that command!');
    }
})

process.on( "SIGINT", function() {
    console.log( "\ngracefully shutting down from SIGINT (Crtl-C)" );
    process.exit();
} );
  
process.on( "exit", function() {
    console.log("Closing db");
    db.close();
    console.log("Done. Goodbye.");
} );

bot.login(config.token);
