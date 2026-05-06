module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "refactor", "test", "style", "ci", "perf", "revert"],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 200],
  },
};
