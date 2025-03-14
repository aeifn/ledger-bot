import {
  Bot,
  Context,
  NextFunction,
} from "https://deno.land/x/grammy@v1.35.0/mod.ts";

import { DatabaseSync } from "node:sqlite";

const BOT_DATA_DIR = Deno.env.get("BOT_DATA_DIR");
if (!BOT_DATA_DIR) throw new Error("BOT_DATA_DIR is not defined");

const db = new DatabaseSync(`${BOT_DATA_DIR}/db.sqlite`);

async function isUserAllowed(userId: number) {
  const result = await db.prepare("SELECT * FROM users WHERE id = ?").get(
    userId,
  );
  return !!result;
}

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not defined");

const bot = new Bot(BOT_TOKEN);

bot.use(async (ctx: Context, next: NextFunction) => {
  if (!ctx.from || !(await isUserAllowed(ctx.from.id))) {
    await ctx.reply("You are not allowed to use this bot");
    return;
  } else {
    await next();
  }
});

class GitRepo {
  repoPath: string;
  sshKey: string;
  constructor(private userId: number) {
    this.repoPath = `${BOT_DATA_DIR}/${userId}/ledger`;
    this.sshKey = `${BOT_DATA_DIR}/${userId}/.ssh/id_ed25519`;
  }
  run(args: string[]) {
    const GIT_SSH_COMMAND = `ssh -i ${this.sshKey} -o IdentitiesOnly=yes`;
    return new Deno.Command("git", {
      args: ["-C", this.repoPath, ...args],
      env: { GIT_SSH_COMMAND },
    }).spawn();
  }
  async reset() {
    await this.run(["fetch", "origin"]).status;
    await this.run(["reset", "--hard", "origin/main"]).status;
  }
}

class Ledger {
  file: string;
  date: string;
  constructor(private userId: number, date?: string) {
    this.date = date ||
      new Date().toISOString().split("T")[0].replace(/-/g, "/");
    this.file = `${BOT_DATA_DIR}/${userId}/ledger/${this.date}.ledger`;
    const directory = this.file.split("/").slice(0, -1).join("/");
    Deno.mkdirSync(directory, { recursive: true });
  }
  async write(content: string) {
    await Deno.writeTextFile(this.file, `\n${this.date} ${content}\n`, {
      append: true,
    });
  }
  async run(args: Array<string>) {
    console.log("running", this.file);
    const cmd = await new Deno.Command("ledger", {
      args: ["-f", this.file].concat(args),
    }).output();
    return new TextDecoder().decode(cmd.stdout);
  }
}

bot.command("ledger", async (ctx) => {
  if (!ctx.from) return;
  try {
    const git = new GitRepo(ctx.from.id);
    await git.reset();
    const ledger = new Ledger(ctx.from.id, "current");
    const result = await ledger.run(ctx.match.split(" "));
    const message = "```ledger\n" + result.substring(0, 4000) + "\n```";
    await ctx.reply(message, { parse_mode: "MarkdownV2" });
  } catch (error) {
    console.error("Message processing error:", error);
    await ctx.reply("Дошло је до грешке.");
  }
});

bot.on("message", async (ctx) => {
  try {
    const content = ctx.message.text || ctx.message.caption || "...";
    console.log(content);
    const git = new GitRepo(ctx.from.id);
    const ledger = new Ledger(ctx.from.id);
    await git.reset();
    await ledger.write(content);
    await git.run(["add", ledger.file]).status;
    await git.run(["commit", "-m", `${ledger.date} ${content}`]).status;
    await git.run(["push"]).status;
    await ctx.react("👌");
  } catch (error) {
    console.error("Message processing error:", error);
    await ctx.reply("Дошло је до грешке.");
  }
});

bot.start();
