import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.tsx"],
  addons: [],
  viteFinal: async (config) => {
    if (config.plugins) {
      config.plugins = config.plugins.map((plugin) => {
        if (Array.isArray(plugin) && plugin[0] === "react") {
          return [
            plugin[0],
            {
              ...plugin[1],
              babel: {
                plugins: [["babel-plugin-react-compiler"]],
              },
            },
          ] as const;
        }
        return plugin;
      });
    }
    return config;
  },
};

export default config;
