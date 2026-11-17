import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const savedTheme = localStorage.getItem('theme');
const initialTheme =
  savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

document.documentElement.classList.remove('light', 'dark');
document.documentElement.classList.add(initialTheme);
document.documentElement.style.colorScheme = initialTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
