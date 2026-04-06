/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // LeetCode difficulty colors
        difficulty: {
          easy: '#00b8a3',
          medium: '#ffc01e',
          hard: '#ef4743',
        },
        // Action button colors
        action: {
          primary: '#3b82f6',
          hover: '#2563eb',
          disabled: '#9ca3af',
        },
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
