import random
import copy

class Piece:
    def __init__(self, team, ptype, value):
        self.team = team
        self.type = ptype
        self.value = value

    def clone(self):
        return Piece(self.team, self.type, self.value)

class GameState:
    def __init__(self):
        self.board = [[None for _ in range(7)] for _ in range(7)]
        self.current_turn = 'A'
        self.game_over = False
        self.winner = None
        self.init_board()

    def init_board(self):
        self.board = [[None for _ in range(7)] for _ in range(7)]
        self.state_counts = {}
        self.game_over = False
        self.winner = None
        self.current_turn = 'A'

        self.board[0][3] = Piece('B', 'flag', 'F')
        self.board[6][3] = Piece('A', 'flag', 'F')

        pieces_b = [Piece('B', 'attacker', v) for v in range(1, 6)]
        random.shuffle(pieces_b)
        for col, p in enumerate(pieces_b, start=1):
            self.board[1][col] = p

        pieces_a = [Piece('A', 'attacker', v) for v in range(1, 6)]
        random.shuffle(pieces_a)
        for col, p in enumerate(pieces_a, start=1):
            self.board[5][col] = p

    def is_valid_move(self, from_r, from_c, to_r, to_c):
        if self.game_over: return False
        if from_r < 0 or from_r >= 7 or from_c < 0 or from_c >= 7: return False
        if to_r < 0 or to_r >= 7 or to_c < 0 or to_c >= 7: return False

        piece = self.board[from_r][from_c]
        if not piece: return False
        if piece.team != self.current_turn: return False
        if piece.type == 'flag': return False

        rdiff = abs(from_r - to_r)
        cdiff = abs(from_c - to_c)
        if not (rdiff <= 1 and cdiff <= 1) or (rdiff == 0 and cdiff == 0):
            return False

        dest = self.board[to_r][to_c]
        if dest and dest.team == piece.team: return False

        if dest and dest.team != piece.team:
            if dest.type != 'flag':
                av = piece.value
                dv = dest.value
                if av == 5 and dv == 1: return False
                if av != 1 and dv == 5 and av < dv: return False
                if av < dv and not (av == 1 and dv == 5): return False
        return True

    def move_piece(self, from_r, from_c, to_r, to_c):
        if not self.is_valid_move(from_r, from_c, to_r, to_c):
            return False
        
        attacker = self.board[from_r][from_c]
        defender = self.board[to_r][to_c]

        if defender:
            if defender.type == 'flag':
                self.board[to_r][to_c] = attacker
                self.board[from_r][from_c] = None
                self.end_game(attacker.team)
            else:
                av = attacker.value
                dv = defender.value
                if av == dv:
                    self.board[to_r][to_c] = attacker
                    self.board[from_r][from_c] = None
                elif av == 1 and dv == 5:
                    self.board[to_r][to_c] = attacker
                    self.board[from_r][from_c] = None
                elif av == 5 and dv == 1:
                    self.board[from_r][from_c] = None
                elif av > dv:
                    self.board[to_r][to_c] = attacker
                    self.board[from_r][from_c] = None
                else:
                    self.board[from_r][from_c] = None
        else:
            self.board[to_r][to_c] = attacker
            self.board[from_r][from_c] = None

        if not self.game_over:
            self.check_attacker_count()

        if not self.game_over:
            state_str = self.get_state_string()
            self.state_counts[state_str] = self.state_counts.get(state_str, 0) + 1
            if self.state_counts[state_str] >= 3:
                self.end_game('Draw_Repetition')

        if not self.game_over:
            self.current_turn = 'B' if self.current_turn == 'A' else 'A'
            if not self.has_any_valid_move(self.current_turn):
                self.end_game('B' if self.current_turn == 'A' else 'A')

        return True

    def get_state_string(self):
        s = self.current_turn + '|'
        for r in range(7):
            for c in range(7):
                p = self.board[r][c]
                if p:
                    s += f"{r}{c}{p.team}{p.type}{p.value}|"
        return s

    def check_attacker_count(self):
        has_a = False
        has_b = False
        for r in range(7):
            for c in range(7):
                p = self.board[r][c]
                if p and p.type == 'attacker':
                    if p.team == 'A': has_a = True
                    if p.team == 'B': has_b = True
        
        if not has_a and not has_b:
            self.end_game('Draw')
        elif not has_a:
            self.end_game('B')
        elif not has_b:
            self.end_game('A')

    def has_any_valid_move(self, team):
        orig_turn = self.current_turn
        self.current_turn = team
        for r in range(7):
            for c in range(7):
                p = self.board[r][c]
                if p and p.team == team and p.type != 'flag':
                    for dr in [-1, 0, 1]:
                        for dc in [-1, 0, 1]:
                            if dr == 0 and dc == 0: continue
                            if self.is_valid_move(r, c, r + dr, c + dc):
                                self.current_turn = orig_turn
                                return True
        self.current_turn = orig_turn
        return False

    def end_game(self, winner):
        self.game_over = True
        self.winner = winner

    def get_moves(self, team):
        moves = []
        orig_turn = self.current_turn
        self.current_turn = team
        for r in range(7):
            for c in range(7):
                p = self.board[r][c]
                if p and p.team == team and p.type != 'flag':
                    for dr in [-1, 0, 1]:
                        for dc in [-1, 0, 1]:
                            if dr == 0 and dc == 0: continue
                            if self.is_valid_move(r, c, r + dr, c + dc):
                                moves.append((r, c, r + dr, c + dc))
        self.current_turn = orig_turn
        return moves
