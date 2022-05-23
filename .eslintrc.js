module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended", "prettier"],
  ignorePatterns: ["html5/js/lib/**/*"],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-undef": 0,
    "no-unused-vars": 0,
  },
};
