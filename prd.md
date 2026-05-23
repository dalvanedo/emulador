# FlagStrike 7x7 - Reglas Completas y Especificaciones del Emulador

## 1. Componentes del Juego
- **Tablero**: Una cuadrícula de 7x7 casillas con un sistema de coordenadas tipo ajedrez (Columnas A-G, Filas 1-7).
- **Equipos**:
  - **Equipo A (Humano/Jugador 1)**: Color azul.
  - **Equipo B (IA/Jugador 2)**: Color rojo.
- **Piezas por Equipo**:
  - **1 Bandera (F)**: Pieza estática e inamovible que debe protegerse.
  - **5 Atacantes (1 al 5)**: Piezas móviles con diferentes rangos numéricos.

## 2. Posición Inicial
- Las **Banderas** se colocan fijas en la posición central de su fila extrema:
  - Bandera B (IA/J2): Fila index 0, Columna 3 (Coordenada D7).
  - Bandera A (Humano/J1): Fila index 6, Columna 3 (Coordenada D1).
- Los **Atacantes** (1 a 5) se mezclan aleatoriamente en la penúltima fila de cada equipo, dejando las esquinas libres:
  - Atacantes B: Fila index 1, Columnas 1 a 5 (Coordenadas B6, C6, D6, E6, F6).
  - Atacantes A: Fila index 5, Columnas 1 a 5 (Coordenadas B2, C2, D2, E2, F2).

## 3. Reglas de Movimiento
- Los turnos se alternan. El Equipo A (Humano) comienza el juego.
- Las banderas **no pueden moverse**.
- Cualquier atacante puede moverse exactamente **1 casilla en cualquier dirección** (horizontal, vertical o diagonal), es decir, hasta 8 posibles casillas adyacentes.
- No se permite moverse a una casilla ocupada por una pieza del mismo equipo.
- **Filtro Anti-Suicidio**: No está permitido realizar un movimiento de ataque a una casilla enemiga si el atacante fuera a perder el combate bajo las reglas de combate. El sistema impide seleccionar movimientos suicidas.

## 4. Resolución del Combate
Cuando un atacante entra en una casilla ocupada por una pieza enemiga, se resuelve el combate:
1. **Captura de la Bandera**: Si se ataca a la bandera enemiga ('F'), es capturada inmediatamente y el juego termina con victoria para el atacante.
2. **Combate entre Atacantes**:
   - **Mayor valor gana**: Una pieza de mayor rango derrota a una de menor rango (ej. 4 derrota a 3).
   - **Excepción del Espía**: El atacante de valor **1** derrota al poderoso de valor **5** si es el que realiza el ataque.
   - **Empate**: En caso de que ambas piezas tengan el mismo rango numérico, el **atacante gana** al defensor.
   - La pieza perdedora se elimina del tablero y la ganadora ocupa la casilla de destino.

## 5. Condiciones de Fin de Juego
El juego puede concluir por tres vías:
- **Captura de Bandera**: Un atacante captura la bandera enemiga.
- **Eliminación de Atacantes**: Si un equipo pierde todas sus piezas atacantes, pierde el juego automáticamente.
- **Empate Técnico**: En el caso extremadamente raro de que ambos equipos se queden sin atacantes al mismo tiempo.

## 6. Inteligencia Artificial (Algoritmo Minimax)
- La IA ejecuta una búsqueda recursiva **Minimax con Poda Alfa-Beta** a una **profundidad de 3 niveles** (Depth 3).
- **Rendimiento O(1)**: Para evitar clonar arrays o realizar copias con `JSON.parse(JSON.stringify())` en cada nivel de recursión, la IA implementa un sistema óptimo de "Hacer/Deshacer movimiento" (Make/Undo move) sobre la misma matriz del tablero.
- **Función de Evaluación Heurística**:
  - Diccionario de pesos exacto: `const weights = {'1': 29.06, '2': 29.09, '3': 36.57, '4': 38.8, '5': 49.76, 'pos': 8.56};`
  - **Material**: Suma el peso del diccionario si la pieza está viva, o resta su peso si la pieza ha sido eliminada.
  - **Posición**: Avanzar hacia la bandera enemiga suma `pos * casillas_avanzadas`.
    - Para el Equipo B, el avance es su coordenada de fila `r` (se acerca a la fila 6).
    - Para el Equipo A, el avance es `6 - r` (se acerca a la fila 0).
  - Puntuación de estado terminal: Victoria IA = `+10000`, Victoria Humano = `-10000`, Empate = `0`.