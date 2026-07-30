module.exports = {
  ci: {
    collect: {
      startServerCommand:
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= pnpm exec next start --hostname 127.0.0.1 --port 4322",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 180000,
      url: [
        "http://127.0.0.1:4322/",
        "http://127.0.0.1:4322/pricing",
        "http://127.0.0.1:4322/guides/how-book-generation-works",
      ],
      numberOfRuns: 2,
      settings: {
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          disabled: false,
        },
        throttlingMethod: "simulate",
      },
    },
    assert: {
      aggregationMethod: "pessimistic",
      assertions: {
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 1 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};
