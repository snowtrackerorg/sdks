import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SnowTrackerError,
  type FormSchema,
  type SnowTrackerClient,
} from '@snowtrackerpro/sdk-core';
import { useSnowTrackerForm, useSnowtrackerForm } from './useSnowTrackerForm.js';

const SCHEMA: FormSchema = {
  id: 'form_01H',
  name: 'Quote request',
  kind: 'quote',
  catalogVersion: 1,
  fields: [
    { key: 'name', type: 'text', label: 'Full name', required: true, maxLen: 200 },
    { key: 'email', type: 'email', label: 'Email', required: true, maxLen: 254 },
    { key: 'phone', type: 'phone', label: 'Phone', required: true, maxLen: 30 },
    { key: 'address', type: 'text', label: 'Property address', required: true, maxLen: 300 },
    {
      key: 'driveway_surface',
      type: 'select',
      label: 'Driveway surface',
      required: false,
      maxLen: 32,
      options: [
        { value: 'paved', label: 'Paved' },
        { value: 'gravel', label: 'Gravel' },
      ],
    },
  ],
  branding: { tenantName: 'Acme Snow', logoUrl: '', primaryHex: '#00bfff' },
  captcha: null,
  token: 'tok_fresh',
};

function fakeClient(overrides: Partial<SnowTrackerClient> = {}): SnowTrackerClient {
  return {
    getTenant: vi.fn(),
    getFormSchema: vi.fn().mockResolvedValue(SCHEMA),
    submitLead: vi.fn().mockResolvedValue({ submissionId: 'lsub_01H', status: 'received' }),
    ...overrides,
  } as SnowTrackerClient;
}

function fillValid(result: { current: ReturnType<typeof useSnowTrackerForm> }) {
  act(() => {
    result.current.setValue('name', 'Jane Doe');
    result.current.setValue('email', 'jane@example.com');
    result.current.setValue('address', '1 Main St, Collingwood');
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSnowTrackerForm', () => {
  it('exports the old lowercase-t name as a deprecated alias of the same function', () => {
    expect(useSnowtrackerForm).toBe(useSnowTrackerForm);
  });

  it('fetches the schema on mount (by kind, abortable) and reaches status ready', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client, kind: 'quote' }));
    expect(result.current.schema).toBeNull();
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(client.getFormSchema).toHaveBeenCalledWith({
      kind: 'quote',
      signal: expect.any(AbortSignal),
    });
    expect(result.current.schema?.id).toBe('form_01H');
  });

  it('fetches by formId when given', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client, formId: 'form_01H' }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    expect(client.getFormSchema).toHaveBeenCalledWith({
      formId: 'form_01H',
      signal: expect.any(AbortSignal),
    });
  });

  it('surfaces a schema-load failure as status load_error, and retry() refetches', async () => {
    const getFormSchema = vi
      .fn()
      .mockRejectedValueOnce(new SnowTrackerError('boom', 'network_error', 0))
      .mockResolvedValue(SCHEMA);
    const client = fakeClient({ getFormSchema });
    const { result } = renderHook(() => useSnowTrackerForm({ client, formId: 'form_x' }));
    await waitFor(() => expect(result.current.status).toBe('load_error'));
    expect(result.current.error?.code).toBe('network_error');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(getFormSchema).toHaveBeenCalledTimes(2);
  });

  it('sets values, validates on submit, and submits with the schema token', async () => {
    const onSuccess = vi.fn();
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client, onSuccess }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());

    fillValid(result);
    act(() => {
      result.current.setValue('driveway_surface', 'gravel');
    });
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({});
    expect(client.submitLead).toHaveBeenCalledWith({
      formId: 'form_01H',
      fields: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        address: '1 Main St, Collingwood',
        driveway_surface: 'gravel',
      },
      website: '',
      token: 'tok_fresh',
    });
    expect(result.current.submitted).toBe(true);
    expect(result.current.submissionId).toBe('lsub_01H');
    expect(onSuccess).toHaveBeenCalledWith({ submissionId: 'lsub_01H', status: 'received' });
  });

  it('blocks submission on client-side validation errors', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());

    await act(() => result.current.submit());

    expect(result.current.errors).toMatchObject({
      name: 'required',
      email: 'email or phone is required',
      address: 'required',
    });
    expect(client.submitLead).not.toHaveBeenCalled();
    expect(result.current.submitted).toBe(false);
  });

  it('clears a field error when the field is edited', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    await act(() => result.current.submit());
    expect(result.current.errors.name).toBe('required');

    act(() => result.current.setValue('name', 'Jane'));
    expect(result.current.errors.name).toBeUndefined();
  });

  it('collapses two synchronous submit() calls into one POST', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);

    await act(async () => {
      const first = result.current.submit();
      const second = result.current.submit();
      await Promise.all([first, second]);
    });
    expect(client.submitLead).toHaveBeenCalledTimes(1);
  });

  it('passes captchaToken through to submitLead', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit({ captchaToken: 'ct_1' }));

    expect(client.submitLead).toHaveBeenCalledWith(
      expect.objectContaining({ captchaToken: 'ct_1' }),
    );
  });

  it('maps a server 422 into per-field errors', async () => {
    const client = fakeClient({
      submitLead: vi.fn().mockRejectedValue(
        new SnowTrackerError('email: invalid email address', 'validation_error', 422, {
          fieldErrors: { email: 'invalid email address' },
        }),
      ),
    });
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({ email: 'invalid email address' });
    expect(result.current.error).toBeNull();
    expect(result.current.submitted).toBe(false);
  });

  it('routes non-schema 422 keys (captcha_token, extra.*) into error, never silently', async () => {
    const client = fakeClient({
      submitLead: vi.fn().mockRejectedValue(
        new SnowTrackerError('captcha_token: required', 'validation_error', 422, {
          fieldErrors: { captcha_token: 'required' },
        }),
      ),
    });
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({});
    expect(result.current.error?.code).toBe('validation_error');
    expect(result.current.error?.fieldErrors).toEqual({ captcha_token: 'required' });
  });

  it('re-mints the token and retries once when the server says it expired', async () => {
    vi.useFakeTimers();
    const submitLead = vi
      .fn()
      .mockRejectedValueOnce(
        new SnowTrackerError('token: form token expired', 'validation_error', 422, {
          fieldErrors: { token: 'form token expired' },
        }),
      )
      .mockResolvedValue({ submissionId: 'lsub_01H', status: 'received' });
    const client = fakeClient({ submitLead });
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('ready');
    fillValid(result);

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit();
    });
    // First POST fails (expired) -> re-mint -> 3s min-age wait -> retry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
      await submitPromise;
    });

    expect(submitLead).toHaveBeenCalledTimes(2);
    expect(client.getFormSchema).toHaveBeenCalledTimes(2); // mount + re-mint
    expect(result.current.submitted).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('surfaces non-field submission failures as error, and clearError() clears them', async () => {
    const client = fakeClient({
      submitLead: vi.fn().mockRejectedValue(
        new SnowTrackerError('rate limit exceeded — retry later', 'rate_limited', 429, {
          retryAfter: 37,
        }),
      ),
    });
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());

    expect(result.current.error?.code).toBe('rate_limited');
    expect(result.current.error?.retryAfter).toBe(37);

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
    expect(result.current.values.name).toBe('Jane Doe'); // values untouched
  });

  it('fails oversized extra loudly before the POST', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit({ extra: { big: 'x'.repeat(1200) } }));

    expect(client.submitLead).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe('validation_error');
    expect(result.current.error?.fieldErrors).toEqual({
      'extra.big': 'value must encode to at most 1024 bytes',
    });
  });

  it('forwards the honeypot website value verbatim', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    act(() => result.current.setValue('website', 'https://spam.example'));
    await act(() => result.current.submit());

    expect(client.submitLead).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example' }),
    );
  });

  it('getString returns "" for unset and non-string values', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    expect(result.current.getString('name')).toBe('');
    act(() => {
      result.current.setValue('name', 'Jane');
      result.current.setValue('address', { line1: '1 Main St' });
    });
    expect(result.current.getString('name')).toBe('Jane');
    expect(result.current.getString('address')).toBe('');
  });

  it('applies hideFields, labels, and extraFields overrides', async () => {
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowTrackerForm({
        client,
        overrides: {
          hideFields: ['driveway_surface'],
          labels: { name: 'Your name' },
          extraFields: [
            {
              key: 'custom:gate_code',
              type: 'text',
              label: 'Gate code',
              required: false,
              maxLen: 50,
            },
          ],
        },
      }),
    );
    await waitFor(() => expect(result.current.schema).not.toBeNull());

    const keys = result.current.schema?.fields.map((f) => f.key);
    expect(keys).toEqual(['name', 'email', 'phone', 'address', 'custom:gate_code']);
    expect(result.current.schema?.fields[0]?.label).toBe('Your name');
  });

  it('extraFields replaces an existing field in place instead of duplicating it', async () => {
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowTrackerForm({
        client,
        overrides: {
          extraFields: [
            {
              key: 'driveway_surface',
              type: 'select',
              label: 'Surface?',
              required: true,
              maxLen: 32,
              options: [{ value: 'paved', label: 'Paved' }],
            },
          ],
        },
      }),
    );
    await waitFor(() => expect(result.current.schema).not.toBeNull());

    const fields = result.current.schema?.fields ?? [];
    expect(fields.filter((f) => f.key === 'driveway_surface')).toHaveLength(1);
    expect(fields.map((f) => f.key)).toEqual([
      'name',
      'email',
      'phone',
      'address',
      'driveway_surface',
    ]);
    expect(fields[4]?.label).toBe('Surface?');
  });

  it('warns in dev when hideFields hides invariant fields on a quote form', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowTrackerForm({ client, overrides: { hideFields: ['address', 'email', 'phone'] } }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('"address"'))).toBe(true);
    expect(messages.some((m) => m.includes('both "email" and "phone"'))).toBe(true);
  });

  it('does not warn about hiding address on a contact form (per-kind invariant)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const contactSchema: FormSchema = {
      ...SCHEMA,
      kind: 'contact',
      name: 'Contact us',
      fields: SCHEMA.fields.map((f) => (f.key === 'address' ? { ...f, required: false } : f)),
    };
    const client = fakeClient({ getFormSchema: vi.fn().mockResolvedValue(contactSchema) });
    const { result } = renderHook(() =>
      useSnowTrackerForm({ client, kind: 'contact', overrides: { hideFields: ['address', 'name'] } }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('"address"'))).toBe(false);
    // name stays required on every kind.
    expect(messages.some((m) => m.includes('"name"'))).toBe(true);
  });

  it('submits a contact form without an address', async () => {
    const contactSchema: FormSchema = {
      ...SCHEMA,
      kind: 'contact',
      name: 'Contact us',
      fields: SCHEMA.fields.map((f) => (f.key === 'address' ? { ...f, required: false } : f)),
    };
    const client = fakeClient({ getFormSchema: vi.fn().mockResolvedValue(contactSchema) });
    const { result } = renderHook(() => useSnowTrackerForm({ client, kind: 'contact' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      result.current.setValue('name', 'Jane Doe');
      result.current.setValue('email', 'jane@example.com');
    });
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({});
    expect(result.current.submitted).toBe(true);
    expect(client.submitLead).toHaveBeenCalledWith(
      expect.objectContaining({ fields: { name: 'Jane Doe', email: 'jane@example.com' } }),
    );
  });

  it('routes override-added fields the server does not know into extra', async () => {
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowTrackerForm({
        client,
        overrides: {
          extraFields: [
            {
              key: 'custom:gate_code',
              type: 'text',
              label: 'Gate code',
              required: false,
              maxLen: 50,
            },
          ],
        },
      }),
    );
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    act(() => result.current.setValue('custom:gate_code', '1234'));
    await act(() => result.current.submit({ extra: { source: 'landing-page' } }));

    expect(client.submitLead).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.not.objectContaining({ 'custom:gate_code': expect.anything() }),
        extra: { source: 'landing-page', 'custom:gate_code': '1234' },
      }),
    );
  });

  it('pinnedSchema: skips the schema fetch, background-mints a token, and waits out the 3s min age', async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    const pinned: FormSchema = { ...SCHEMA, token: 'tok_stale_snapshot' };
    const { result } = renderHook(() =>
      useSnowTrackerForm({ client, overrides: { pinnedSchema: pinned } }),
    );

    // Schema available immediately from the snapshot; one background token
    // mint, no schema replacement.
    expect(result.current.status).toBe('ready');
    expect(result.current.schema?.id).toBe('form_01H');
    expect(client.getFormSchema).toHaveBeenCalledTimes(1);
    expect(client.getFormSchema).toHaveBeenCalledWith({
      formId: 'form_01H',
      signal: expect.any(AbortSignal),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // let the mint promise settle
    });

    fillValid(result);
    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit();
    });
    // 1s after mint: still inside the server's 3s minimum token age.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(client.submitLead).not.toHaveBeenCalled();
    // Past 3s: the POST goes out with the fresh token, not the snapshot's.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
      await submitPromise;
    });

    expect(client.getFormSchema).toHaveBeenCalledTimes(1); // no extra fetch at submit
    expect(client.submitLead).toHaveBeenCalledTimes(1);
    expect(client.submitLead).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok_fresh' }));
    expect(result.current.submitted).toBe(true);
  });

  it('captures overrides at mount: a new inline pinnedSchema identity never refetches or reshapes', async () => {
    const client = fakeClient();
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useSnowTrackerForm>[0]) => useSnowTrackerForm(props),
      { initialProps: { client, overrides: { pinnedSchema: { ...SCHEMA } } } },
    );
    await waitFor(() => expect(client.getFormSchema).toHaveBeenCalledTimes(1)); // background mint

    rerender({ client, overrides: { pinnedSchema: { ...SCHEMA, name: 'Changed' } } });
    expect(client.getFormSchema).toHaveBeenCalledTimes(1);
    expect(result.current.schema?.name).toBe('Quote request');
  });

  it('reset clears values, errors, and submission state', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowTrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());
    expect(result.current.submitted).toBe(true);

    act(() => result.current.reset());
    expect(result.current.values).toEqual({});
    expect(result.current.errors).toEqual({});
    expect(result.current.submitted).toBe(false);
    expect(result.current.submissionId).toBeNull();
  });
});
