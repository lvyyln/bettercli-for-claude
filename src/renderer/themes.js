// Each theme drives the CSS variables (ui), the xterm palette (term) and the window title bar.
const THEMES = {
  midnight: {
    label: 'Midnight',
    ui: {
      bg: '#0F1115', panel: '#161A20', term: '#0B0D10', border: '#262B33', border2: '#2F3640',
      text: '#E6E8EB', muted: '#9AA3AE', faint: '#7C8591', accent: '#5CC8BA', accentText: '#0F1115',
      warn: '#E8B45A', idle: '#4A515C', selected: '#242B35', hover: '#1D232B', danger: '#F2A3A3'
    },
    term: {
      background: '#0B0D10', foreground: '#E6E8EB', cursor: '#E6E8EB', selectionBackground: '#2F3640',
      black: '#1D232B', red: '#F07178', green: '#A8E6A3', yellow: '#E8B45A', blue: '#82AAFF',
      magenta: '#C792EA', cyan: '#5CC8BA', white: '#C5CBD3', brightBlack: '#5B6470', brightRed: '#FF8B92',
      brightGreen: '#C3F0BE', brightYellow: '#F5CD85', brightBlue: '#A3C0FF', brightMagenta: '#DDB2F5',
      brightCyan: '#8FDDD2', brightWhite: '#FFFFFF'
    }
  },
  nord: {
    label: 'Nord',
    ui: {
      bg: '#2E3440', panel: '#272C36', term: '#2E3440', border: '#3B4252', border2: '#434C5E',
      text: '#ECEFF4', muted: '#A9B1BF', faint: '#8B93A3', accent: '#88C0D0', accentText: '#2E3440',
      warn: '#EBCB8B', idle: '#4C566A', selected: '#3B4252', hover: '#323846', danger: '#E08A92'
    },
    term: {
      background: '#2E3440', foreground: '#D8DEE9', cursor: '#D8DEE9', selectionBackground: '#434C5E',
      black: '#3B4252', red: '#BF616A', green: '#A3BE8C', yellow: '#EBCB8B', blue: '#81A1C1',
      magenta: '#B48EAD', cyan: '#88C0D0', white: '#E5E9F0', brightBlack: '#4C566A', brightRed: '#D08770',
      brightGreen: '#A3BE8C', brightYellow: '#EBCB8B', brightBlue: '#81A1C1', brightMagenta: '#B48EAD',
      brightCyan: '#8FBCBB', brightWhite: '#ECEFF4'
    }
  },
  dracula: {
    label: 'Dracula',
    ui: {
      bg: '#21222C', panel: '#1B1C24', term: '#282A36', border: '#343746', border2: '#44475A',
      text: '#F8F8F2', muted: '#B0B2C3', faint: '#8F92A8', accent: '#BD93F9', accentText: '#1B1C24',
      warn: '#FFB86C', idle: '#5A6390', selected: '#383A4C', hover: '#2A2C3A', danger: '#FF7A7A'
    },
    term: {
      background: '#282A36', foreground: '#F8F8F2', cursor: '#F8F8F2', selectionBackground: '#44475A',
      black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C', blue: '#BD93F9',
      magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2', brightBlack: '#6272A4', brightRed: '#FF6E6E',
      brightGreen: '#69FF94', brightYellow: '#FFFFA5', brightBlue: '#D6ACFF', brightMagenta: '#FF92DF',
      brightCyan: '#A4FFFF', brightWhite: '#FFFFFF'
    }
  },
  solarized: {
    label: 'Solarized Dark',
    ui: {
      bg: '#002B36', panel: '#00232C', term: '#002B36', border: '#0A3D4A', border2: '#124A58',
      text: '#EEE8D5', muted: '#A3B0B0', faint: '#839496', accent: '#2AA198', accentText: '#002B36',
      warn: '#D9A400', idle: '#586E75', selected: '#073642', hover: '#04313D', danger: '#F07A6A'
    },
    term: {
      background: '#002B36', foreground: '#C9D3D3', cursor: '#EEE8D5', selectionBackground: '#124A58',
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900', blue: '#268BD2',
      magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5', brightBlack: '#586E75', brightRed: '#CB4B16',
      brightGreen: '#93A72A', brightYellow: '#CFA121', brightBlue: '#4BA3E3', brightMagenta: '#6C71C4',
      brightCyan: '#3CBDB2', brightWhite: '#FDF6E3'
    }
  },
  daylight: {
    label: 'Daylight',
    ui: {
      bg: '#F6F7F9', panel: '#EDEFF2', term: '#FFFFFF', border: '#DADFE5', border2: '#C9D0D8',
      text: '#1C2128', muted: '#57606A', faint: '#6E7781', accent: '#0F766E', accentText: '#FFFFFF',
      warn: '#B26B00', idle: '#A0A8B2', selected: '#DCE2E9', hover: '#E4E8ED', danger: '#C62828'
    },
    term: {
      background: '#FFFFFF', foreground: '#1C2128', cursor: '#1C2128', selectionBackground: '#C8D7E8',
      black: '#24292F', red: '#CF222E', green: '#116329', yellow: '#7D4E00', blue: '#0969DA',
      magenta: '#8250DF', cyan: '#1B7C83', white: '#6E7781', brightBlack: '#57606A', brightRed: '#A40E26',
      brightGreen: '#1A7F37', brightYellow: '#633C01', brightBlue: '#218BFF', brightMagenta: '#A475F9',
      brightCyan: '#3192AA', brightWhite: '#8C959F'
    }
  }
};
