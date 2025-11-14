import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings, { type SettingsFormValues } from '../Settings';

jest.mock('../../services/credentialValidation', () => ({
  verifyPinboardCredentials: jest.fn(() => Promise.resolve()),
  verifyOpenAiToken: jest.fn(() => Promise.resolve()),
}));

const { verifyPinboardCredentials, verifyOpenAiToken } =
  jest.requireMock('../../services/credentialValidation');

afterEach(() => {
  jest.clearAllMocks();
});

const renderSettings = (initialValues?: Partial<SettingsFormValues>) =>
  render(
    <Settings
      initialValues={{
        pinboardUser: '',
        pinboardToken: '',
        openAiToken: '',
        ...initialValues,
      }}
      onSave={jest.fn()}
      onCancel={jest.fn()}
    />
  );

describe('Settings form', () => {
  it('shows validation errors when required fields missing', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /save & return/i }));
    expect(await screen.findByText(/Username is required/i)).toBeInTheDocument();
    expect(screen.getByText(/API token is required/i)).toBeInTheDocument();
    expect(verifyPinboardCredentials).not.toHaveBeenCalled();
  });

  it('submits trimmed values after validators succeed', async () => {
    const onSave = jest.fn();
    render(
      <Settings
        initialValues={{
          pinboardUser: '  alice  ',
          pinboardToken: '  token123  ',
          openAiToken: '  sk-test  ',
        }}
        onSave={onSave}
        onCancel={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save & return/i }));

    await waitFor(() => {
      expect(verifyPinboardCredentials).toHaveBeenCalledWith({
        username: '  alice  ',
        token: '  token123  ',
      });
    });

    expect(verifyOpenAiToken).toHaveBeenCalledWith('  sk-test  ');
    expect(onSave).toHaveBeenCalledWith({
      pinboardUser: 'alice',
      pinboardToken: 'token123',
      openAiToken: 'sk-test',
    });
  });
});
