import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  verifyPinboardCredentials,
  verifyOpenAiToken,
} from '../services/credentialValidation';

const fieldDefaults = {
  pinboardUser: '',
  pinboardToken: '',
  openAiToken: '',
};

function Settings({ initialValues = fieldDefaults, onSave, onCancel }) {
  const [formState, setFormState] = useState({
    ...fieldDefaults,
    ...initialValues,
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!formState.pinboardUser.trim()) {
      nextErrors.pinboardUser = 'Username is required';
    }
    if (!formState.pinboardToken.trim()) {
      nextErrors.pinboardToken = 'API token is required';
    }
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsValidating(true);
    try {
      await verifyPinboardCredentials({
        username: formState.pinboardUser,
        token: formState.pinboardToken,
      });
    } catch (error) {
      setIsValidating(false);
      setErrors((prev) => ({
        ...prev,
        pinboardUser: 'Check your Pinboard username.',
        pinboardToken: error instanceof Error ? error.message : 'Invalid token',
      }));
      setSubmitError(
        error instanceof Error ? error.message : 'Pinboard verification failed.'
      );
      return;
    }

    try {
      await verifyOpenAiToken(formState.openAiToken);
    } catch (error) {
      setIsValidating(false);
      setErrors((prev) => ({
        ...prev,
        openAiToken:
          error instanceof Error && error.message
            ? error.message
            : 'OpenAI token could not be verified.',
      }));
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : 'OpenAI verification failed.'
      );
      return;
    }

    setIsValidating(false);
    onSave({
      pinboardUser: formState.pinboardUser.trim(),
      pinboardToken: formState.pinboardToken.trim(),
      openAiToken: formState.openAiToken.trim(),
    });
  };

  return (
    <form
      className="settings-form"
      onSubmit={handleSubmit}
      autoComplete="off"
      data-1p-ignore="true"
    >
      <h2>Account Settings</h2>
      <p className="settings-form__helper">
        Store your Pincushion credentials locally and securely in your browser.
      </p>

      <label htmlFor="pinboardUser">Pinboard username</label>
      <input
        id="pinboardUser"
        name="pinboardUser"
        type="text"
        autoComplete="username"
        value={formState.pinboardUser}
        onChange={handleChange}
        aria-invalid={Boolean(errors.pinboardUser)}
        data-1p-ignore="true"
      />
      {errors.pinboardUser && (
        <span className="helptext" role="alert">
          {errors.pinboardUser}
        </span>
      )}

      <label htmlFor="pinboardToken">Pinboard API token</label>
      <input
        id="pinboardToken"
        name="pinboardToken"
        type="password"
        autoComplete="current-password"
        value={formState.pinboardToken}
        onChange={handleChange}
        aria-invalid={Boolean(errors.pinboardToken)}
        data-1p-ignore="true"
      />
      {errors.pinboardToken && (
        <span className="helptext" role="alert">
          {errors.pinboardToken}
        </span>
      )}

      <label htmlFor="openAiToken">OpenAI API token (optional)</label>
      <input
        id="openAiToken"
        name="openAiToken"
        type="password"
        autoComplete="off"
        value={formState.openAiToken}
        onChange={handleChange}
        data-1p-ignore="true"
      />
      <p className="settings-form__helper small">
        GPT suggestions run only when a valid OpenAI token is stored here. You can
        create or find a key at <strong>https://platform.openai.com/account/api-keys</strong>.
      </p>
      {errors.openAiToken && (
        <span className="helptext" role="alert">
          {errors.openAiToken}
        </span>
      )}

      {submitError && submitError !== errors.openAiToken && (
        <div className="error-message" role="alert">
          {submitError}
        </div>
      )}

      <div className="settings-form__actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={isValidating}>
          {isValidating ? 'Validating…' : 'Save & return'}
        </button>
      </div>
    </form>
  );
}

Settings.propTypes = {
  initialValues: PropTypes.shape({
    pinboardUser: PropTypes.string,
    pinboardToken: PropTypes.string,
    openAiToken: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default Settings;
