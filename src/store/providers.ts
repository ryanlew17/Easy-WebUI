/**
 * 平台（Provider）状态。所有变更即写库；onModelCheck 事件实时合并 last_check。
 */
import { create } from 'zustand';
import type { ModelCheck, Provider, ProviderDraft, ProviderModel } from '@shared/types';
import { getApi } from '../bridge';

interface ProvidersState {
  providers: Provider[];
  loaded: boolean;
  load: () => Promise<void>;
  create: (draft: ProviderDraft, models?: ProviderModel[]) => Promise<Provider>;
  update: (
    id: string,
    patch: Partial<ProviderDraft> & { models?: ProviderModel[] },
  ) => Promise<Provider>;
  remove: (id: string) => Promise<{ affectedConversations: number }>;
  applyModelCheck: (providerId: string, modelId: string, check: ModelCheck) => void;
}

export const useProvidersStore = create<ProvidersState>()((set, get) => ({
  providers: [],
  loaded: false,

  load: async () => {
    const providers = await getApi().listProviders();
    set({ providers, loaded: true });
  },

  create: async (draft, models) => {
    const created = await getApi().createProvider(draft);
    let final = created;
    if (models && models.length > 0) {
      final = await getApi().updateProvider(created.id, { models });
    }
    set({ providers: [...get().providers, final] });
    return final;
  },

  update: async (id, patch) => {
    const updated = await getApi().updateProvider(id, patch);
    set({ providers: get().providers.map((p) => (p.id === id ? updated : p)) });
    return updated;
  },

  remove: async (id) => {
    const res = await getApi().deleteProvider(id);
    set({ providers: get().providers.filter((p) => p.id !== id) });
    return res;
  },

  applyModelCheck: (providerId, modelId, check) => {
    set({
      providers: get().providers.map((p) =>
        p.id !== providerId
          ? p
          : {
              ...p,
              models: p.models.map((m) => (m.id === modelId ? { ...m, last_check: check } : m)),
            },
      ),
    });
  },
}));

/** 便捷选择器：全部已启用模型（供模型选择器按平台分组） */
export function enabledModelsByProvider(providers: Provider[]): {
  provider: Provider;
  models: ProviderModel[];
}[] {
  return providers
    .map((provider) => ({
      provider,
      models: provider.models.filter((m) => m.enabled),
    }))
    .filter((g) => g.models.length > 0);
}
