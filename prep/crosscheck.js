// crosscheck.js -- run the browser model (js/physics.js) on inputs written by checks.py
// usage: node prep/crosscheck.js prep/xcheck_in.json prep/xcheck_out.json
const fs = require("fs");
const P = require("../js/physics.js");
const [inp, out] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(inp, "utf8"));
const res = cases.map((c) => {
  const r = P.simulate(Object.assign({ record: false }, c));
  return { carry: r.carry, apex: r.apex, time: r.time, lateral: r.lateral, ok: r.ok };
});
fs.writeFileSync(out, JSON.stringify(res));
console.log(`ran ${res.length} cases`);
