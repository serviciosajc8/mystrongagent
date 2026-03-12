export const getCurrentTime = {
  name: "get_current_time",
  description: "Get the current time and date in ISO format.",
  execute: async () => {
    return new Date().toISOString();
  },
  schema: {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current time and date in ISO format.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};
