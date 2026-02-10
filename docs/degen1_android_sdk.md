# Android SDK

## 1. Kotlin Coroutines

To add the WalletSDK to your app, please add this snippet of code to your settings.gradle.kts file:

```kts
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}
```

Then just add to the project-level build.gradle & in the app-level build.gradle, like this:

{% tabs %}
{% tab title="Groovy" %}

```groovy
// Web3j needed for the WalletSDK
implementation 'org.web3j:core:4.9.4'
implementation 'com.github.EthereumPhone:WalletSDK:0.2.0'
```

{% endtab %}

{% tab title="KTS" %}

```kts
// Web3j needed for the WalletSDK
implementation("org.web3j:core:4.9.4")
implementation("com.github.EthereumPhone:WalletSDK:0.1.0")
```

{% endtab %}
{% endtabs %}

You can check whether the system-wallet is on the dGEN1 by checking `getSystemService("wallet") != null`.

### **How to initialize the SDK:**

```kotlin
val wallet = WalletSDK(
    context = context,
    bundlerRPCUrl = BuildConfig.BUNDLER_RPC_URL,
    // optional: override default web3 provider used for reads (eth_call, code, etc.)
    web3jInstance = Web3j.build(HttpService("https://base.llamarpc.com")/)
)
```

### **How to get the dGEN1 wallet address:**

```kotlin
CoroutineScope(Dispatchers.IO).launch {
    val address = wallet.getAddress()
}
```

### **How to sign a message:**

```kotlin
CoroutineScope(Dispatchers.IO).launch {
    val signature = wallet.signMessage(
        message = "Message to sign",
        chainId = 1, // required
        // type = "personal_sign" // optional (default)
    )
}
```

### **How to send a single transaction:**

```kotlin
CoroutineScope(Dispatchers.IO).launch {
    val userOpHashOrError = wallet.sendTransaction(
        to = "0x3a4e6ed8b0f02bfbfaa3c6506af2db939ea5798c",
        value = "1000000000000000000", // wei
        data = "", // Empty string means regular eth send tx
        callGas = null,                // null → auto-estimate via bundler
        chainId = 1,
        rpcEndpoint = "https://rpc.ankr.com/eth" // optional, but needs to align with chainid and bundler rpc
    )
}
```

### **How to send a multi-action transaction:**

```kotlin
CoroutineScope(Dispatchers.IO).launch {
    val txs = listOf(
        WalletSDK.TxParams(
            to = "0x...",
            value = "0",
            data = "0x1234"
        ),
        WalletSDK.TxParams(
            to = "0x...",
            value = "12345",
            data = ""
        )
    )
    val userOpHash = wallet.sendTransaction(
        txParamsList = txs,
        callGas = null,
        chainId = 1,
        rpcEndpoint = "https://rpc.ankr.com/eth"
    )
}
```

---

That’s all you should need to know for Coroutines. You should now be able to reference the system wallet to do transactions within your app!

{% embed url="<https://github.com/EthereumPhone/WalletSDK/tree/main>" %}

If there are any other questions please feel free to reach out in our discord, or message me on telegram at `@mhaas_eth`.
