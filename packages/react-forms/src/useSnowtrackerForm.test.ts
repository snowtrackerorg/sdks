import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  SnowTrackerError,
  type FormSchema,
  type SnowTrackerClient,
} from '@snowtrackerpro/sdk-core';
import { useSnowtrackerForm } from './useSnowtrackerForm.js';

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

function fillValid(result: { current: ReturnType<typeof useSnowtrackerForm> }) {
  act(() => {
    result.current.setValue('name', 'Jane Doe');
    result.current.setValue('email', 'jane@example.com');
    result.current.setValue('address', '1 Main St, Collingwood');
  });
}

describe('useSnowtrackerForm', () => {
  it('fetches the schema on mount (by kind, abortable)', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowtrackerForm({ client, kind: 'quote' }));
    expect(result.current.schema).toBeNull();
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    expect(client.getFormSchema).toHaveBeenCalledWith({
      kind: 'quote',
      signal: expect.any(AbortSignal),
    });
    expect(result.current.schema?.id).toBe('form_01H');
  });

  it('fetches by formId when given', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowtrackerForm({ client, formId: 'form_01H' }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    expect(client.getFormSchema).toHaveBeenCalledWith({
      formId: 'form_01H',
      signal: expect.any(AbortSignal),
    });
  });

  it('surfaces a schema-load failure as error', async () => {
    const client = fakeClient({
      getFormSchema: vi
        .fn()
        .mockRejectedValue(new SnowTrackerError('form not found', 'not_found', 404)),
    });
    const { result } = renderHook(() => useSnowtrackerForm({ client, formId: 'form_x' }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.code).toBe('not_found');
  });

  it('sets values, validates on submit, and submits with the schema token', async () => {
    const onSuccess = vi.fn();
    const client = fakeClient();
    const { result } = renderHook(() => useSnowtrackerForm({ client, onSuccess }));
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
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
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
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    await act(() => result.current.submit());
    expect(result.current.errors.name).toBe('required');

    act(() => result.current.setValue('name', 'Jane'));
    expect(result.current.errors.name).toBeUndefined();
  });

  it('maps a server 422 into per-field errors', async () => {
    const client = fakeClient({
      submitLead: vi.fn().mockRejectedValue(
        new SnowTrackerError('email: invalid email address', 'validation_error', 422, {
          fieldErrors: { email: 'invalid email address' },
        }),
      ),
    });
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({ email: 'invalid email address' });
    expect(result.current.error).toBeNull();
    expect(result.current.submitted).toBe(false);
  });

  it('surfaces non-field submission failures as error', async () => {
    const client = fakeClient({
      submitLead: vi.fn().mockRejectedValue(
        new SnowTrackerError('rate limit exceeded — retry later', 'rate_limited', 429, {
          retryAfter: 37,
        }),
      ),
    });
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    await act(() => result.current.submit());

    expect(result.current.error?.code).toBe('rate_limited');
    expect(result.current.error?.retryAfter).toBe(37);
  });

  it('forwards the honeypot website value verbatim', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
    await waitFor(() => expect(result.current.schema).not.toBeNull());
    fillValid(result);
    act(() => result.current.setValue('website', 'https://spam.example'));
    await act(() => result.current.submit());

    expect(client.submitLead).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example' }),
    );
  });

  it('applies hideFields, labels, and extraFields overrides', async () => {
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowtrackerForm({
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

  it('routes override-added fields the server does not know into extra', async () => {
    const client = fakeClient();
    const { result } = renderHook(() =>
      useSnowtrackerForm({
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

  it('pinnedSchema skips the fetch and mints a fresh token at submit time', async () => {
    const client = fakeClient();
    const pinned: FormSchema = { ...SCHEMA, token: 'tok_stale_snapshot' };
    const { result } = renderHook(() =>
      useSnowtrackerForm({ client, overrides: { pinnedSchema: pinned } }),
    );

    // Schema available immediately, no fetch on mount.
    expect(result.current.schema?.id).toBe('form_01H');
    expect(client.getFormSchema).not.toHaveBeenCalled();

    fillValid(result);
    await act(() => result.current.submit());

    // One token-minting fetch, and the submission used the fresh token.
    expect(client.getFormSchema).toHaveBeenCalledTimes(1);
    expect(client.getFormSchema).toHaveBeenCalledWith({ formId: 'form_01H' });
    expect(client.submitLead).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok_fresh' }));
    expect(result.current.submitted).toBe(true);
  });

  it('reset clears values, errors, and submission state', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useSnowtrackerForm({ client }));
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
