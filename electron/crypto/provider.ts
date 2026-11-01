import type { CryptoService } from './index';
import type { ProvidersDao } from '../db/providers';

/** 解密平台密钥；旧 safeStorage 密文只在原值未变化时回写，避免覆盖并发换钥/清钥。 */
export async function decryptProviderKey(
  crypto: CryptoService,
  providers: ProvidersDao,
  providerId: string,
  cipher: string,
): Promise<string> {
  return crypto.decryptString(cipher, (nextCipher) => {
    providers.updateKeyCipherIfUnchanged(providerId, cipher, nextCipher);
  });
}
