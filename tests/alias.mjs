import { register } from "node:module";

/* Se carga con `node --import ./tests/alias.mjs`. Ver alias-hooks.mjs. */
register("./alias-hooks.mjs", import.meta.url);
