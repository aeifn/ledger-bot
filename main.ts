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

async function auth(ctx: Context, next: NextFunction) {
  if (!ctx.from || !(await isUserAllowed(ctx.from.id))) {
    await ctx.reply("You are not allowed to use this bot");
    return;
  } else {
    await next();
  }
}

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not defined");

const bot = new Bot(BOT_TOKEN);

bot.use(auth);

function getUserConfig(userId: number) {
  return {
    ledgerPath: `${BOT_DATA_DIR}/${userId}/ledger`,
    sshKey: `${BOT_DATA_DIR}/${userId}/.ssh/id_ed25519`,
  };
}

function git(
  sshKey: string,
  args: Array<string>,
) {
  const GIT_SSH_COMMAND = `ssh -i ${sshKey} -o IdentitiesOnly=yes`;
  return new Deno.Command("git", { args: args, env: { GIT_SSH_COMMAND } })
    .spawn();
}

bot.command("ledger", async (ctx) => {
  if (!ctx.from) return;
  const { ledgerPath, sshKey } = getUserConfig(ctx.from.id);
  await git(sshKey, ["-C", ledgerPath, "fetch", "origin"]).status;
  await git(sshKey, ["-C", ledgerPath, "reset", "--hard", "origin/main"])
    .status;
  const cmd = await new Deno.Command("ledger", {
    args: ["-f", `${ledgerPath}/current.ledger`].concat(ctx.match.split(" ")),
  }).output();
  const stdout = new TextDecoder().decode(cmd.stdout);
  const message = "```ledger\n" + stdout.substring(0, 4000) +
    "\n```";
  await ctx.reply(message, { parse_mode: "MarkdownV2" });
});

bot.on("message", async (ctx) => {
  if (!ctx.from) return;
  const { ledgerPath, sshKey } = getUserConfig(ctx.from.id);
  await git(sshKey, ["-C", ledgerPath, "fetch", "origin"]).status;
  await git(sshKey, ["-C", ledgerPath, "reset", "--hard", "origin/main"])
    .status;

  const date = new Date().toISOString().split("T")[0].replace(/-/g, "/");
  const filePath = `${ledgerPath}/${date}.ledger`;
  const content = ctx.message.text || ctx.message.caption;
  if (!content) return;

  await Deno.writeTextFile(filePath, `\n${date} ${content}\n`, {
    append: true,
  });
  await git(sshKey, ["-C", ledgerPath, "add", filePath]).status;
  await git(sshKey, ["-C", ledgerPath, "commit", "-m", `${date} ${content}`])
    .status;
  await git(sshKey, ["-C", ledgerPath, "push"])
    .status;
  await ctx.react("👌");
});

bot.start();
