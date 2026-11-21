# Okapi SUNMI Shell

Aplicacion Android nativa para terminales SUNMI D3 con:

- `WebView` cargando `https://okapi.programasdteme.com`
- bridge JavaScript `window.SunmiPrinter`
- impresion directa usando el servicio interno de SUNMI

## Que resuelve

La web ya detecta `window.SunmiPrinter`. Este shell inyecta ese objeto dentro del `WebView` para que los tickets se impriman sin abrir el dialogo del navegador.

## Bridge disponible

Desde la web quedan disponibles estos metodos:

```js
await window.SunmiPrinter.isAvailable();
await window.SunmiPrinter.printReceipt(receiptDocument);
```

El `receiptDocument` corresponde al mismo formato definido en `src/types/printing.ts` del proyecto principal.

## Como compilar el APK

1. Abre la carpeta `android/sunmi-shell` en Android Studio.
2. Deja que Android Studio sincronice el proyecto.
3. Si Android Studio solicita crear o configurar Gradle Wrapper, acepta la configuracion sugerida por el IDE.
4. Genera un APK debug desde `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
5. Instala el APK en la SUNMI D3.

## URL de la app

La URL inicial se define en `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "APP_URL", "\"https://okapi.programasdteme.com\"")
```

Si luego cambias de dominio o ambiente, actualiza ese valor y recompila.

## Como probar en la SUNMI

1. Instala el APK.
2. Abre la app `Okapi SUNMI`.
3. Inicia sesion en el sistema.
4. Genera una precuenta o cobro.
5. El ticket debe salir directo por la impresora interna sin popup del navegador.

## Verificacion rapida en consola web

Dentro del `WebView`, puedes comprobar que el bridge existe con:

```js
typeof window.SunmiPrinter
```

Debe devolver:

```js
"object"
```

Y esta llamada debe responder `true` cuando la impresora este enlazada:

```js
await window.SunmiPrinter.isAvailable()
```

## Notas

- El proyecto usa AIDL directo contra el servicio de impresion SUNMI.
- Si la SUNMI no enlaza el servicio, la web seguira mostrando el fallback del navegador.
- Este proyecto no se pudo compilar desde este entorno porque aqui no hay Gradle ni Android SDK instalados.
