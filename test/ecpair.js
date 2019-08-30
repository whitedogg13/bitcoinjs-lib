"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mocha_1 = require("mocha");
const proxyquire = require("proxyquire");
const __1 = require("..");
const fixtures = require("./fixtures/ecpair.json");
const hoodwink = require('hoodwink');
const tinysecp = require('tiny-secp256k1');
const NETWORKS_LIST = Object.values(__1.networks);
const ZERO = Buffer.alloc(32, 0);
const ONE = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const GROUP_ORDER = Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'hex');
const GROUP_ORDER_LESS_1 = Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', 'hex');
mocha_1.describe('ECPair', () => {
    mocha_1.describe('getPublicKey', () => {
        let keyPair;
        mocha_1.beforeEach(() => {
            keyPair = __1.ECPair.fromPrivateKey(ONE);
        });
        mocha_1.it('calls pointFromScalar lazily', hoodwink(() => {
            assert.strictEqual(keyPair.__Q, undefined);
            // .publicKey forces the memoization
            assert.strictEqual(keyPair.publicKey.toString('hex'), '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
            assert.strictEqual(keyPair.__Q.toString('hex'), '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
        }));
    });
    mocha_1.describe('fromPrivateKey', () => {
        mocha_1.it('defaults to compressed', () => {
            const keyPair = __1.ECPair.fromPrivateKey(ONE);
            assert.strictEqual(keyPair.compressed, true);
        });
        mocha_1.it('supports the uncompressed option', () => {
            const keyPair = __1.ECPair.fromPrivateKey(ONE, {
                compressed: false,
            });
            assert.strictEqual(keyPair.compressed, false);
        });
        mocha_1.it('supports the network option', () => {
            const keyPair = __1.ECPair.fromPrivateKey(ONE, {
                compressed: false,
                network: __1.networks.testnet,
            });
            assert.strictEqual(keyPair.network, __1.networks.testnet);
        });
        fixtures.valid.forEach(f => {
            mocha_1.it('derives public key for ' + f.WIF, () => {
                const d = Buffer.from(f.d, 'hex');
                const keyPair = __1.ECPair.fromPrivateKey(d, {
                    compressed: f.compressed,
                });
                assert.strictEqual(keyPair.publicKey.toString('hex'), f.Q);
            });
        });
        fixtures.invalid.fromPrivateKey.forEach(f => {
            mocha_1.it('throws ' + f.exception, () => {
                const d = Buffer.from(f.d, 'hex');
                assert.throws(() => {
                    __1.ECPair.fromPrivateKey(d, f.options);
                }, new RegExp(f.exception));
            });
        });
    });
    mocha_1.describe('fromPublicKey', () => {
        fixtures.invalid.fromPublicKey.forEach(f => {
            mocha_1.it('throws ' + f.exception, () => {
                const Q = Buffer.from(f.Q, 'hex');
                assert.throws(() => {
                    __1.ECPair.fromPublicKey(Q, f.options);
                }, new RegExp(f.exception));
            });
        });
    });
    mocha_1.describe('fromWIF', () => {
        fixtures.valid.forEach(f => {
            mocha_1.it('imports ' + f.WIF + ' (' + f.network + ')', () => {
                const network = __1.networks[f.network];
                const keyPair = __1.ECPair.fromWIF(f.WIF, network);
                assert.strictEqual(keyPair.privateKey.toString('hex'), f.d);
                assert.strictEqual(keyPair.compressed, f.compressed);
                assert.strictEqual(keyPair.network, network);
            });
        });
        fixtures.valid.forEach(f => {
            mocha_1.it('imports ' + f.WIF + ' (via list of networks)', () => {
                const keyPair = __1.ECPair.fromWIF(f.WIF, NETWORKS_LIST);
                assert.strictEqual(keyPair.privateKey.toString('hex'), f.d);
                assert.strictEqual(keyPair.compressed, f.compressed);
                assert.strictEqual(keyPair.network, __1.networks[f.network]);
            });
        });
        fixtures.invalid.fromWIF.forEach(f => {
            mocha_1.it('throws on ' + f.WIF, () => {
                assert.throws(() => {
                    const networks = f.network
                        ? __1.networks[f.network]
                        : NETWORKS_LIST;
                    __1.ECPair.fromWIF(f.WIF, networks);
                }, new RegExp(f.exception));
            });
        });
    });
    mocha_1.describe('toWIF', () => {
        fixtures.valid.forEach(f => {
            mocha_1.it('exports ' + f.WIF, () => {
                const keyPair = __1.ECPair.fromWIF(f.WIF, NETWORKS_LIST);
                const result = keyPair.toWIF();
                assert.strictEqual(result, f.WIF);
            });
        });
    });
    mocha_1.describe('makeRandom', () => {
        const d = Buffer.alloc(32, 4);
        const exWIF = 'KwMWvwRJeFqxYyhZgNwYuYjbQENDAPAudQx5VEmKJrUZcq6aL2pv';
        mocha_1.describe('uses randombytes RNG', () => {
            mocha_1.it('generates a ECPair', () => {
                const stub = {
                    randombytes: () => {
                        return d;
                    },
                };
                const ProxiedECPair = proxyquire('../src/ecpair', stub);
                const keyPair = ProxiedECPair.makeRandom();
                assert.strictEqual(keyPair.toWIF(), exWIF);
            });
        });
        mocha_1.it('allows a custom RNG to be used', () => {
            const keyPair = __1.ECPair.makeRandom({
                rng: (size) => {
                    return d.slice(0, size);
                },
            });
            assert.strictEqual(keyPair.toWIF(), exWIF);
        });
        mocha_1.it('retains the same defaults as ECPair constructor', () => {
            const keyPair = __1.ECPair.makeRandom();
            assert.strictEqual(keyPair.compressed, true);
            assert.strictEqual(keyPair.network, __1.networks.bitcoin);
        });
        mocha_1.it('supports the options parameter', () => {
            const keyPair = __1.ECPair.makeRandom({
                compressed: false,
                network: __1.networks.testnet,
            });
            assert.strictEqual(keyPair.compressed, false);
            assert.strictEqual(keyPair.network, __1.networks.testnet);
        });
        mocha_1.it('throws if d is bad length', () => {
            function rng() {
                return Buffer.alloc(28);
            }
            assert.throws(() => {
                __1.ECPair.makeRandom({ rng });
            }, /Expected Buffer\(Length: 32\), got Buffer\(Length: 28\)/);
        });
        mocha_1.it('loops until d is within interval [1, n) : 1', hoodwink(function () {
            const rng = this.stub(() => {
                if (rng.calls === 0)
                    return ZERO; // 0
                return ONE; // >0
            }, 2);
            __1.ECPair.makeRandom({ rng });
        }));
        mocha_1.it('loops until d is within interval [1, n) : n - 1', hoodwink(function () {
            const rng = this.stub(() => {
                if (rng.calls === 0)
                    return ZERO; // <1
                if (rng.calls === 1)
                    return GROUP_ORDER; // >n-1
                return GROUP_ORDER_LESS_1; // n-1
            }, 3);
            __1.ECPair.makeRandom({ rng });
        }));
    });
    mocha_1.describe('.network', () => {
        fixtures.valid.forEach(f => {
            mocha_1.it('returns ' + f.network + ' for ' + f.WIF, () => {
                const network = __1.networks[f.network];
                const keyPair = __1.ECPair.fromWIF(f.WIF, NETWORKS_LIST);
                assert.strictEqual(keyPair.network, network);
            });
        });
    });
    mocha_1.describe('tinysecp wrappers', () => {
        let keyPair;
        let hash;
        let signature;
        mocha_1.beforeEach(() => {
            keyPair = __1.ECPair.makeRandom();
            hash = ZERO;
            signature = Buffer.alloc(64, 1);
        });
        mocha_1.describe('signing', () => {
            mocha_1.it('wraps tinysecp.sign', hoodwink(function () {
                this.mock(tinysecp, 'sign', (h, d) => {
                    assert.strictEqual(h, hash);
                    assert.strictEqual(d, keyPair.privateKey);
                    return signature;
                }, 1);
                assert.strictEqual(keyPair.sign(hash), signature);
            }));
            mocha_1.it('throws if no private key is found', () => {
                delete keyPair.__D;
                assert.throws(() => {
                    keyPair.sign(hash);
                }, /Missing private key/);
            });
        });
        mocha_1.describe('verify', () => {
            mocha_1.it('wraps tinysecp.verify', hoodwink(function () {
                this.mock(tinysecp, 'verify', (h, q, s) => {
                    assert.strictEqual(h, hash);
                    assert.strictEqual(q, keyPair.publicKey);
                    assert.strictEqual(s, signature);
                    return true;
                }, 1);
                assert.strictEqual(keyPair.verify(hash, signature), true);
            }));
        });
    });
    mocha_1.describe('optional low R signing', () => {
        const sig = Buffer.from('95a6619140fca3366f1d3b013b0367c4f86e39508a50fdce' +
            'e5245fbb8bd60aa6086449e28cf15387cf9f85100bfd0838624ca96759e59f65c10a00' +
            '16b86f5229', 'hex');
        const sigLowR = Buffer.from('6a2660c226e8055afad317eeba918a304be79208d505' +
            '3bc5ea4a5e4c5892b4a061c717c5284ae5202d721c0e49b4717b79966280906b1d3b52' +
            '95d1fdde963c35', 'hex');
        const lowRKeyPair = __1.ECPair.fromWIF('L3nThUzbAwpUiBAjR5zCu66ybXSPMr2zZ3ikp' + 'ScpTPiYTxBynfZu');
        const dataToSign = Buffer.from('b6c5c548a7f6164c8aa7af5350901626ebd69f9ae' + '2c1ecf8871f5088ec204cfe', 'hex');
        mocha_1.it('signs with normal R by default', () => {
            const signed = lowRKeyPair.sign(dataToSign);
            assert.deepStrictEqual(sig, signed);
        });
        mocha_1.it('signs with low R when true is passed', () => {
            const signed = lowRKeyPair.sign(dataToSign, true);
            assert.deepStrictEqual(sigLowR, signed);
        });
    });
});
