import './ui/styles.css';
import { mountShell } from './app/shell';

const app = document.getElementById('app');
if (app) mountShell(app);
