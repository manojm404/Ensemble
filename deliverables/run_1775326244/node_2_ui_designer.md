<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Futuristic Neon Glass Calculator</title>
<style>
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    body {
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #060913;
        overflow: hidden;
        position: relative;
    }

    body::before, body::after {
        content: '';
        position: absolute;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        filter: blur(120px);
        z-index: 0;
    }

    body::before {
        background: rgba(0, 255, 170, 0.25);
        top: -10%;
        left: -10%;
    }

    body::after {
        background: rgba(0, 210, 255, 0.25);
        bottom: -10%;
        right: -10%;
    }

    .calculator {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 380px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 32px;
        padding: 30px;
        box-shadow: 0 25px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .display {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(0, 255, 170, 0.4);
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 25px;
        text-align: right;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 110px;
        word-wrap: break-word;
        word-break: break-all;
        box-shadow: 0 0 20px rgba(0, 255, 170, 0.15), inset 0 0 15px rgba(0, 255, 170, 0.1);
        transition: all 0.3s ease;
    }

    .display:hover {
        box-shadow: 0 0 30px rgba(0, 255, 170, 0.25), inset 0 0 20px rgba(0, 255, 170, 0.15);
    }

    .previous-operand {
        color: rgba(255, 255, 255, 0.6);
        font-size: 1.2rem;
        min-height: 1.5rem;
        margin-bottom: 5px;
        text-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
    }

    .current-operand {
        color: #ffffff;
        font-size: 2.8rem;
        font-weight: 300;
        letter-spacing: 2px;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(0, 255, 170, 0.4);
    }

    .keypad {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(5, 65px);
        gap: 15px;
    }

    button {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        color: #ffffff;
        font-size: 1.5rem;
        font-weight: 400;
        cursor: pointer;
        outline: none;
        transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        display: flex;
        justify-content: center;
        align-items: center;
    }

    button:hover {
        transform: translateY(-3px) scale(1.05);
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(0, 210, 255, 0.5);
        box-shadow: 0 8px 25px rgba(0, 210, 255, 0.3), inset 0 0 10px rgba(0, 210, 255, 0.2);
        color: #00d2ff;
        text-shadow: 0 0 8px #00d2ff;
        z-index: 2;
    }

    button:active {
        transform: translateY(1px) scale(0.98);
    }

    .span-2 {
        grid-column: span 2;
    }

    .row-span-2 {
        grid-row: span 2;
    }

    .btn-action {
        color: #00d2ff;
        font-weight: 500;
        text-shadow: 0 0 5px rgba(0, 210, 255, 0.4);
    }

    .btn-operator {
        background: rgba(0, 210, 255, 0.05);
        border-color: rgba(0, 210, 255, 0.2);
        color: #00d2ff;
        font-size: 1.8rem;
    }

    .btn-operator:hover {
        background: rgba(0, 210, 255, 0.15);
        box-shadow: 0 8px 25px rgba(0, 210, 255, 0.4), inset 0 0 15px rgba(0, 210, 255, 0.3);
    }

    .btn-equals {
        background: rgba(0, 255, 170, 0.1);
        border-color: rgba(0, 255, 170, 0.4);
        color: #00ffaa;
        font-size: 2rem;
        text-shadow: 0 0 10px rgba(0, 255, 170, 0.6);
        box-shadow: 0 5px 20px rgba(0, 255, 170, 0.2), inset 0 0 10px rgba(0, 255, 170, 0.1);
    }

    .btn-equals:hover {
        background: rgba(0, 255, 170, 0.25);
        border-color: rgba(0, 255, 170, 0.8);
        color: #ffffff;
        text-shadow: 0 0 15px #00ffaa, 0 0 30px #00ffaa;
        box-shadow: 0 10px 30px rgba(0, 255, 170, 0.5), inset 0 0 20px rgba(0, 255, 170, 0.4);
    }

    @media (max-width: 400px) {
        .calculator {
            padding: 20px;
            border-radius: 24px;
        }
        .keypad {
            gap: 10px;
            grid-template-rows: repeat(5, 55px);
        }
        button {
            font-size: 1.3rem;
            border-radius: 14px;
        }
        .current-operand {
            font-size: 2.2rem;
        }
    }
</style>
</head>
<body>

<div class="calculator">
    <div class="display">
        <div class="previous-operand"></div>
        <div class="current-operand">0</div>
    </div>
    <div class="keypad">
        <button class="btn-action span-2">AC</button>
        <button class="btn-operator">&divide;</button>
        <button class="btn-operator">&times;</button>
        
        <button class="btn-number">7</button>
        <button class="btn-number">8</button>
        <button class="btn-number">9</button>
        <button class="btn-operator">&minus;</button>
        
        <button class="btn-number">4</button>
        <button class="btn-number">5</button>
        <button class="btn-number">6</button>
        <button class="btn-operator">&plus;</button>
        
        <button class="btn-number">1</button>
        <button class="btn-number">2</button>
        <button class="btn-number">3</button>
        <button class="btn-equals row-span-2">&equals;</button>
        
        <button class="btn-number span-2">0</button>
        <button class="btn-action">&period;</button>
    </div>
</div>

</body>
</html>