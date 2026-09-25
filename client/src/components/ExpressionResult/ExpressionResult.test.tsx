import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CameraPermissionError } from '../../utils/errors';
import { ExpressionResult } from './ExpressionResult';

describe('ExpressionResult', () => {
  it('shows emoji, label, and confidence for a detected expression', () => {
    render(
      <ExpressionResult
        state={{
          kind: 'detected',
          expression: { expression: 'happy', confidence: 0.94, updatedAt: 0 },
        }}
      />,
    );
    expect(screen.getByText('😊')).toBeInTheDocument();
    expect(screen.getByTestId('expression-title')).toHaveTextContent('Happy');
    expect(screen.getByText('Detected expression')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute(
      'aria-valuenow',
      '94',
    );
  });

  it('marks low confidence in text, not only colour', () => {
    render(
      <ExpressionResult
        state={{
          kind: 'low-confidence',
          expression: { expression: 'sad', confidence: 0.32, updatedAt: 0 },
        }}
      />,
    );
    expect(screen.getByTestId('expression-title')).toHaveTextContent('Sad (uncertain)');
    expect(screen.getByText(/\(low\)/)).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'idle' } as const, 'Camera is off'],
    [{ kind: 'requesting-camera' } as const, 'Waiting for camera permission…'],
    [{ kind: 'loading-model' } as const, 'Loading AI model…'],
    [{ kind: 'detecting' } as const, 'Detecting face…'],
    [{ kind: 'no-face' } as const, 'No face detected'],
  ])('renders the %o state', (state, title) => {
    render(<ExpressionResult state={state} />);
    expect(screen.getByTestId('expression-title')).toHaveTextContent(title);
  });

  it('shows the error message for error states', () => {
    render(
      <ExpressionResult state={{ kind: 'camera-error', error: new CameraPermissionError() }} />,
    );
    expect(screen.getByText(/Camera permission was denied/)).toBeInTheDocument();
  });
});
