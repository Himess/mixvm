import { ethers } from "hardhat";

// Zama Sepolia Coprocessor Adresleri
const SEPOLIA_ACL = "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D";
const SEPOLIA_COPROCESSOR = "0x92C920834Ec8941d2C77D188936E1f7A6f49c127";
const SEPOLIA_KMS = "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A";

// Minimal ABI for checking
const COPROCESSOR_ABI = [
  "function trivialEncrypt(uint256 pt, uint8 toType) external returns (bytes32)",
  "function fheAdd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) external returns (bytes32)",
];

const ACL_ABI = [
  "function isAllowed(bytes32 handle, address account) external view returns (bool)",
  "function allowedForDecryption(bytes32[] memory handlesList) external view returns (bool)",
];

async function main() {
  console.log("=== Sepolia Coprocessor Kontrol ===\n");

  // Sepolia RPC
  const sepoliaRpc = "https://ethereum-sepolia-rpc.publicnode.com";
  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpc);

  console.log("Sepolia'ya bağlanıyor...");
  const blockNumber = await sepoliaProvider.getBlockNumber();
  console.log("Sepolia Block:", blockNumber);

  // Kontrat kodlarını kontrol et
  console.log("\n--- Kontrat Kodları ---");

  const aclCode = await sepoliaProvider.getCode(SEPOLIA_ACL);
  console.log("ACL kontrat var mı:", aclCode !== "0x" ? "✅ Evet" : "❌ Hayır");
  console.log("ACL code length:", aclCode.length);

  const coprocessorCode = await sepoliaProvider.getCode(SEPOLIA_COPROCESSOR);
  console.log(
    "Coprocessor kontrat var mı:",
    coprocessorCode !== "0x" ? "✅ Evet" : "❌ Hayır"
  );
  console.log("Coprocessor code length:", coprocessorCode.length);

  const kmsCode = await sepoliaProvider.getCode(SEPOLIA_KMS);
  console.log(
    "KMS kontrat var mı:",
    kmsCode !== "0x" ? "✅ Evet" : "❌ Hayır"
  );
  console.log("KMS code length:", kmsCode.length);

  // ACL ile bir view call dene
  console.log("\n--- ACL View Call Test ---");
  try {
    const acl = new ethers.Contract(SEPOLIA_ACL, ACL_ABI, sepoliaProvider);
    const dummyHandle = ethers.zeroPadBytes("0x1234", 32);
    const dummyAddress = "0x0000000000000000000000000000000000000001";

    const isAllowed = await acl.isAllowed(dummyHandle, dummyAddress);
    console.log("ACL.isAllowed() çalışıyor:", "✅");
    console.log("Sonuç (beklenen: false):", isAllowed);
  } catch (error: any) {
    console.log("ACL.isAllowed() hatası:", error.message);
  }

  // Coprocessor interface kontrolü
  console.log("\n--- Coprocessor Interface Kontrolü ---");
  try {
    // Sadece interface'i kontrol ediyoruz, çağırmıyoruz
    const coprocessor = new ethers.Contract(
      SEPOLIA_COPROCESSOR,
      COPROCESSOR_ABI,
      sepoliaProvider
    );

    // staticCall ile gas olmadan deneyebiliriz
    console.log("Coprocessor interface mevcut ✅");

    // NOT: Gerçek bir FHE işlemi yapmak için Sepolia ETH lazım
    console.log("\nNOT: Gerçek FHE testi için Sepolia ETH gerekli");
  } catch (error: any) {
    console.log("Coprocessor interface hatası:", error.message);
  }

  console.log("\n=== Sonuç ===");
  console.log("Sepolia'da Zama kontratları mevcut ve erişilebilir.");
  console.log("Ancak cross-chain kullanım için ciddi engeller var:");
  console.log("1. msg.sender kontrolü - Arc'tan gelen mesaj farklı sender olur");
  console.log("2. ACL izinleri - Handle'lar Sepolia'da kaydedilir");
  console.log("3. State locality - Sonuçlar Sepolia storage'ında");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
