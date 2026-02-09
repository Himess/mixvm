declare module "circomlibjs" {
  export interface Poseidon {
    (inputs: bigint[]): Uint8Array;
    F: any;
  }

  export function buildPoseidon(): Promise<Poseidon>;
}

declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
  }

  export namespace groth16 {
    function fullProve(
      input: Record<string, string | string[]>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;

    function verify(
      vk: any,
      publicSignals: string[],
      proof: Groth16Proof
    ): Promise<boolean>;

    function exportSolidityCallData(
      proof: Groth16Proof,
      publicSignals: string[]
    ): Promise<string>;
  }

  export namespace zKey {
    function newZKey(
      r1csName: string,
      ptauName: string,
      zkeyName: string,
      logger?: any
    ): Promise<void>;

    function contribute(
      zkeyNameOld: string,
      zkeyNameNew: string,
      name: string,
      entropy: string
    ): Promise<void>;

    function exportVerificationKey(zkeyName: string): Promise<any>;

    function exportSolidityVerifier(
      zkeyName: string,
      templates: { groth16: string }
    ): Promise<string>;
  }
}
