// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MockUSDT — a minimal, self-contained ERC20 used ONLY on public testnets
 * (BSC Testnet, Ethereum Sepolia) for Phase 5.6 end-to-end custody testing.
 *
 * - 6 decimals, to mirror real USDT base units.
 * - `mint` is owner-only (the deployer), used by the funding script to top up
 *   the demo deposit address and the hot wallet.
 * - `faucet` lets anyone self-mint a small amount for convenience.
 *
 * It is intentionally dependency-free (no OpenZeppelin) so it compiles with a
 * bare solc and ships no mainnet risk — there is no upgrade path and no value.
 */
contract MockUSDT {
    string public constant name = "Mock USDT";
    string public constant symbol = "mUSDT";
    uint8 public constant decimals = 6;

    address public owner;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    function faucet(uint256 value) external {
        require(value <= 1_000_000 * 10 ** 6, "faucet cap");
        _mint(msg.sender, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "zero to");
        uint256 bal = balanceOf[from];
        require(bal >= value, "balance");
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        require(to != address(0), "zero to");
        totalSupply += value;
        unchecked {
            balanceOf[to] += value;
        }
        emit Transfer(address(0), to, value);
    }
}
