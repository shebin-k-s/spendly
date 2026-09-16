import axios from 'axios';

const MAX_MESSAGE_LENGTH = 160;

export function getErrorMessage(error: unknown): string {
  const message = axios.isAxiosError(error)
    ? error.response?.data?.message || error.message || 'Something went wrong'
    : error instanceof Error ? error.message : 'Something went wrong';

  // Defense in depth against a toast rendering a wall of text — the
  // backend caps its own error messages too, but this covers anything
  // else (e.g. a raw network/axios message) that could still be long.
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}
