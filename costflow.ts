import costflow from "../parser/dist/costflow.esm.js";

const config = {
  mode: "ledger",
  currency: "RSD",
  timezone: "Europe/Belgrade",
  account: {
    cash: "assets:cash",
    grocery: "expenses:grocery",
  },
  formula: {
    spotify: "@Spotify #music 15.98 USD visa > music",
  },
};

const fn = async () => {
  const result = await costflow("10 a b c @mypayee visa > spotify", config);
  console.log(result);
};
fn();
