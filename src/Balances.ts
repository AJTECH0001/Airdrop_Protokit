import { RuntimeModule, runtimeMethod, state } from "@proto-kit/module";  
import { StateMap } from "@proto-kit/protocol";  
import { PublicKey, UInt64 } from "o1js";  

export class Balances extends RuntimeModule<unknown> {  
  @state() public balances = StateMap.from<PublicKey, UInt64>(PublicKey, UInt64);  

  @runtimeMethod()
  public mint(to: PublicKey, amount: UInt64): void {  
    const balance = this.balances.get(to) ?? UInt64.zero;  
    const newBalance = balance.add(amount);  
    this.balances.set(to, newBalance);  
  }  
}
