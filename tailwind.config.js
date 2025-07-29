
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        'gold': '#fbbf24',
        'gold-dark': '#f59e0b',
        'gold-light': '#fef3c7',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'bounce-subtle': 'bounceSubtle 2s infinite',
        'gold-shimmer': 'goldShimmer 2s infinite',
        'pulse-gold': 'pulseGold 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' }
        },
        goldShimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(251, 191, 36, 0.7)' },
          '50%': { boxShadow: '0 0 0 10px rgba(251, 191, 36, 0)' }
        }
      }
    }
  },
  plugins: []
}
