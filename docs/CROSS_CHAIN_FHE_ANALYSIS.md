# Cross-Chain FHE Analizi

## Mevcut Durum

### Zama Sepolia Adresleri
```
ACL: 0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D
Coprocessor: 0x92C920834Ec8941d2C77D188936E1f7A6f49c127
KMSVerifier: 0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A
```

### Arc Network Cross-Chain Destekleri
- LayerZero ✅
- Circle CCTP ✅
- Wormhole ✅
- Stargate ✅

## Sorun: Neden Direkt Cross-Chain Çalışmaz?

### 1. msg.sender Problemi
```solidity
// Impl.sol:672
result = IFHEVMExecutor($.CoprocessorAddress).verifyInput(
    inputHandle,
    msg.sender,  // <-- Bu Arc'taki kontrat değil, LayerZero executor olur
    inputProof,
    toType
);
```

Cross-chain mesajda `msg.sender` orijinal kullanıcı değil, bridge kontratı olur.

### 2. ACL İzin Sistemi
```solidity
// ACL her handle için izin kontrolü yapıyor
IACL($.ACLAddress).allowTransient(result, msg.sender);
```

Arc'tan gelen istek için Sepolia ACL'de izin olmayacak.

### 3. Senkronizasyon
- FHE işlemleri Sepolia'da yapılacak
- Sonuç Arc'a geri dönecek
- Ama bu sonuç (handle) Sepolia'daki storage'a işaret ediyor

## Potansiyel Çözümler

### Çözüm A: Relay Pattern
```
Arc                          Sepolia
┌─────────────┐              ┌─────────────┐
│ User ───────┼─── LZ Msg ──►│ Relay Kontrat│
│             │              │      │       │
│             │              │      ▼       │
│             │              │ Zama Coprocessor
│             │              │      │       │
│             │◄── LZ Msg ───┼──────┘       │
│ Result      │              │              │
└─────────────┘              └─────────────┘
```

**Problem:** Sonuç handle'ı Sepolia'da geçerli, Arc'ta değil.

### Çözüm B: Dual-State Pattern
Arc'ta ve Sepolia'da aynı state'i tutmak:
1. Arc'ta şifreli veri "referansını" tut
2. Gerçek şifreli veri Sepolia'da
3. İşlem yapılacağında Sepolia'ya git

**Problem:** Çok karmaşık, latency yüksek.

### Çözüm C: Off-Chain Orchestrator
Zincir dışında bir servis:
1. Arc'tan eventi yakala
2. Sepolia'da işlem yap
3. Sonucu Arc'a geri yaz

**Problem:** Merkezi bir nokta, güven gerektirir.

## Kritik Soru: Coprocessor Nasıl Çalışıyor?

Zama dokümanlarından:
> "Host chain does not need to change anything... FHE operations can be executed in parallel"

Coprocessor zaten off-chain çalışıyor. Yani:
1. Sepolia kontratı event emit ediyor
2. Off-chain coprocessor bu eventi dinliyor
3. Hesaplama yapıp sonucu geri yazıyor

**Bu demek ki:** Coprocessor zaten cross-chain bir yapı - sadece Zama'nın off-chain node'ları Sepolia'yı dinliyor.

## Yeni Fikir: Arc İçin Coprocessor "Proxy"

```
Arc                    Off-Chain              Sepolia
┌─────────────┐        ┌────────┐            ┌─────────────┐
│ FHE Kontrat │        │ Relayer│            │             │
│     │       │        │   │    │            │             │
│ emit Event──┼───────►│   │    │            │             │
│             │        │   │    │            │             │
│             │        │   ▼    │            │             │
│             │        │ Zama   │◄──────────►│ Coprocessor │
│             │        │ Infra  │            │             │
│             │        │   │    │            │             │
│◄────────────┼────────┼───┘    │            │             │
│ Result      │        │        │            │             │
└─────────────┘        └────────┘            └─────────────┘
```

Aslında Zama'nın yapması gereken tam da bu - Arc'ı da dinleyen bir coprocessor node eklemek.

## Sonuç

Cross-chain FHE teknik olarak çok zor çünkü:

1. **State Locality:** Şifreli veriler belirli bir zincire bağlı
2. **ACL Permissions:** İzinler chain-specific
3. **Handle Sistemi:** Handle'lar local coprocessor'a işaret ediyor

**Daha Pratik Yaklaşım:**
Zama'ya "Arc'ı destekleyin" demek için:
- Arc'ın teknik uyumluluğunu kanıtladık ✅
- Mock coprocessor çalıştı ✅
- Eksik olan sadece Zama'nın off-chain altyapısı

Cross-chain yerine Zama'yı Arc'a getirmek daha mantıklı.
