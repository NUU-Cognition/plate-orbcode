import React from 'react';
import ReactDOM from 'react-dom/client';
import { getPlateContext } from '@nuucognition/plate-sdk';
import { App } from './App';
import './index.css';

async function bootstrap() {
  let connected = false;

  try {
    await getPlateContext();
    connected = true;
  } catch {
    connected = false;
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App connected={connected} />
    </React.StrictMode>,
  );
}

void bootstrap();
