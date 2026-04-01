module.exports = {
  start: jest.fn(async () => ({
    id: "workflow-run-test",
    status: "queued",
  })),
};
