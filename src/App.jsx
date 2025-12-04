import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// --- DATA 2 PERSONA ---
const PERSONAS = [
  {
    id: "all-in-one",
    name: "All-in-One",
    emoji: "✨",
    desc: "Asisten cerdas serba bisa.",
    color: "from-blue-600 to-indigo-600",
    instruction: "Anda adalah asisten AI 'All-in-One' yang cerdas, membantu, dan sopan. Anda bisa menjawab segala jenis pertanyaan, menganalisis gambar, membantu koding, dan menerjemahkan bahasa. Jawablah dengan format yang rapi dan mudah dibaca.",
  },
  {
    id: "image-gen",
    name: "Image Generator",
    emoji: "🎨",
    desc: "Membuat gambar visual instan.",
    color: "from-fuchsia-600 to-pink-600",
    instruction: "Anda adalah AI Image Generator. Tugas Anda HANYA SATU: Mengubah permintaan user menjadi GAMBAR VISUAL. \n\nATURAN PENTING:\n1. Jangan banyak bicara.\n2. Jika user minta gambar (contoh: 'kucing terbang'), Anda WAJIB membalas menggunakan format Markdown Image berikut:\n![Generated Image](https://image.pollinations.ai/prompt/{deskripsi_detail_inggris}?nologo=true)\n\n3. Ganti {deskripsi_detail_inggris} dengan deskripsi visual yang sangat detail dalam Bahasa Inggris berdasarkan request user. Ganti spasi dengan %20.\n\nContoh respons yang benar:\n![Generated Image](https://image.pollinations.ai/prompt/cute%20cat%20flying%20in%20space%20galaxy%20stars%204k%20realistic?nologo=true)\n\nSilakan generate gambarnya sekarang.",
  }
];

export default function App() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("chat_history");
    return saved ? JSON.parse(saved) : [{
      id: 1,
      text: "Halo! Saya siap membantu. Pilih **All-in-One** untuk chat biasa, atau **Image Generator** untuk membuat gambar! 🖼️",
      sender: "bot",
    }];
  });

  const [selectedPersona, setSelectedPersona] = useState(() => {
    const saved = localStorage.getItem("chat_persona");
    return saved ? JSON.parse(saved) : PERSONAS[0];
  });

  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    localStorage.setItem("chat_history", JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("chat_persona", JSON.stringify(selectedPersona));
  }, [selectedPersona]);

  // --- LOGIC ---
  const speakText = (text) => {
    window.speechSynthesis.cancel();
    // Jangan baca URL gambar
    if (text.includes("![Generated Image]")) {
        const utterance = new SpeechSynthesisUtterance("Gambar berhasil dibuat.");
        utterance.lang = "id-ID";
        window.speechSynthesis.speak(utterance);
        return;
    }
    const cleanText = text.replace(/[*#`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "id-ID";
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Browser tidak support suara.");
    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const fileToGenerativePart = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ inlineData: { data: reader.result.split(",")[1], mimeType: file.type } });
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) setImage(file);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() && !image) return;

    const currentImage = image;
    const currentInput = input;

    setInput("");
    setImage(null);
    setIsLoading(true);

    const userMessage = { 
        id: Date.now(), 
        text: currentInput, 
        sender: "user",
        imagePreview: currentImage ? URL.createObjectURL(currentImage) : null 
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: selectedPersona.instruction 
        });

        let promptContent = [];
        // Kirim konteks history agar percakapan nyambung
        const historyContext = messages.slice(-5).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        
        if(historyContext) promptContent.push(`Previous Context:\n${historyContext}\n---`);
        if (currentInput) promptContent.push(currentInput);
        if (currentImage) {
            const imagePart = await fileToGenerativePart(currentImage);
            promptContent.push(imagePart);
        }

        const result = await model.generateContent(promptContent);
        const response = await result.response;
        const text = response.text();

        const botMessage = { id: Date.now() + 1, text: text, sender: "bot" };
        setMessages((prev) => [...prev, botMessage]);

    } catch (error) {
        setMessages((prev) => [...prev, { id: Date.now() + 1, text: `❌ Error: ${error.message}`, sender: "bot" }]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-slate-100 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#0c0c0e]/80 backdrop-blur-xl border-r border-white/5 transform transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 flex flex-col shadow-2xl`}>
        <div className="p-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${selectedPersona.color} animate-pulse shadow-[0_0_10px_currentColor]`}></div>
                <h2 className="font-bold text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">LAR AI</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-4 mb-2">Select Mode</p>
            {PERSONAS.map((persona) => (
                <button
                    key={persona.id}
                    onClick={() => { setSelectedPersona(persona); setIsSidebarOpen(false); setMessages([]); }}
                    className={`group w-full text-left p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                        selectedPersona.id === persona.id 
                        ? "bg-white/5 border-white/10 shadow-lg" 
                        : "bg-transparent border-transparent hover:bg-white/5"
                    }`}
                >
                    {selectedPersona.id === persona.id && (
                        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${persona.color}`}></div>
                    )}
                    <div className="flex items-center gap-4 relative z-10">
                        <span className="text-2xl filter drop-shadow-lg group-hover:scale-110 transition-transform">{persona.emoji}</span>
                        <div>
                            <span className={`font-bold block ${selectedPersona.id === persona.id ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`}>{persona.name}</span>
                            <span className="text-xs text-slate-500 group-hover:text-slate-400">{persona.desc}</span>
                        </div>
                    </div>
                </button>
            ))}
        </div>

        <div className="p-6 border-t border-white/5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">G</div>
                <div>
                    <p className="text-sm font-bold text-indigo-200">Gilar Wahiditya</p>
                    <p className="text-[10px] text-indigo-400/60">Pro Plan Active</p>
                </div>
            </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full relative bg-gradient-to-tl from-[#09090b] via-[#0f1016] to-[#09090b]">
        
        {/* TOP BAR */}
        <header className="absolute top-0 left-0 right-0 z-20 p-4 md:p-6 flex items-center justify-between bg-gradient-to-b from-[#09090b] to-transparent">
            <div className="flex items-center gap-4">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-white bg-white/10 rounded-lg backdrop-blur-md">☰</button>
                <div className="flex flex-col">
                    <h1 className="font-bold text-xl text-white flex items-center gap-2">
                        {selectedPersona.name}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${selectedPersona.color} text-white bg-opacity-20 border border-white/10`}>Active</span>
                    </h1>
                </div>
            </div>
            <button onClick={() => {if(window.confirm('Reset Chat?')) { setMessages([]); localStorage.removeItem('chat_history'); }}} className="p-2 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-rose-400" title="Clear Chat">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </header>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto pt-24 pb-32 px-4 md:px-8 space-y-8 custom-scrollbar scroll-smooth">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                    <span className="text-8xl mb-6 grayscale">{selectedPersona.emoji}</span>
                    <p className="text-xl font-light tracking-wide">Ready to assist you.</p>
                </div>
            )}

            {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-fade-in group`}>
                <div className={`flex flex-col gap-2 max-w-[90%] md:max-w-[70%]`}>
                    <div className={`relative p-5 md:p-6 text-sm md:text-base leading-7 shadow-xl backdrop-blur-sm ${
                        msg.sender === "user"
                        ? "bg-white text-slate-900 rounded-3xl rounded-tr-sm"
                        : "bg-[#1a1b26]/90 text-slate-200 rounded-3xl rounded-tl-sm border border-white/5"
                    }`}>
                        {msg.imagePreview && (
                            <div className="mb-4 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
                                <img src={msg.imagePreview} alt="upload" className="w-full object-cover" />
                            </div>
                        )}
                        
                        {msg.sender === "user" ? (
                             msg.text
                        ) : (
                            <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#0c0c0e] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl max-w-none">
                                <ReactMarkdown components={{
                                    img: ({node, ...props}) => (
                                        <div className="rounded-xl overflow-hidden my-2 shadow-lg border border-white/10">
                                            <img {...props} className="w-full h-auto" loading="lazy" />
                                        </div>
                                    ),
                                    code({ node, inline, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || "");
                                        return !inline && match ? (
                                        <div className="my-4 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                            <div className="bg-[#0c0c0e] px-4 py-2 text-xs text-slate-500 border-b border-white/5 flex justify-between items-center font-mono uppercase tracking-wider">
                                                <span>{match[1]}</span>
                                                <button onClick={() => copyToClipboard(String(children))} className="hover:text-indigo-400">Copy</button>
                                            </div>
                                            <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: "1.5rem", background: "#0c0c0e" }} {...props}>{String(children).replace(/\n$/, "")}</SyntaxHighlighter>
                                        </div>
                                        ) : (<code className="bg-white/10 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>);
                                    },
                                }}>{msg.text}</ReactMarkdown>
                            </div>
                        )}
                    </div>

                    {msg.sender === "bot" && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button onClick={() => speakText(msg.text)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-indigo-400 transition-colors" title="Read Aloud"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg></button>
                            <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-indigo-400 transition-colors" title="Copy Text"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                        </div>
                    )}
                </div>
            </div>
            ))}
            
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-[#1a1b26] border border-white/5 px-6 py-4 rounded-3xl rounded-tl-sm flex gap-2 items-center shadow-lg">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-75"></span>
                        <span className="w-2 h-2 bg-pink-500 rounded-full animate-bounce delay-150"></span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="absolute bottom-6 left-0 right-0 px-4 md:px-8 flex justify-center z-30">
            <form onSubmit={handleSend} className="w-full max-w-4xl relative group">
                <div className={`absolute -inset-1 rounded-[2rem] bg-gradient-to-r ${selectedPersona.color} opacity-20 blur-lg transition-opacity duration-500 ${isListening || isLoading ? 'opacity-50' : 'group-hover:opacity-40'}`}></div>
                
                <div className="relative flex items-end gap-2 bg-[#13141c]/90 backdrop-blur-xl border border-white/10 p-2 rounded-[2rem] shadow-2xl transition-all duration-300 ring-1 ring-white/5 focus-within:ring-indigo-500/50">
                    <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleImageSelect} />
                    <button type="button" onClick={() => fileInputRef.current.click()} className={`p-4 rounded-full transition-all duration-300 ${image ? "bg-indigo-500/20 text-indigo-400 rotate-12" : "hover:bg-white/5 text-slate-400 hover:text-white"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                    {image && (
                        <div className="absolute -top-16 left-4 p-1 bg-[#13141c] border border-white/10 rounded-xl shadow-xl animate-fade-in">
                            <div className="relative">
                                <img src={URL.createObjectURL(image)} alt="Preview" className="h-12 w-12 object-cover rounded-lg" />
                                <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 shadow-md"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                            </div>
                        </div>
                    )}
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isListening ? "Mendengarkan..." : `Tanya ${selectedPersona.name}...`} className="flex-1 bg-transparent border-none text-slate-200 placeholder-slate-500 focus:ring-0 py-4 px-2 text-base md:text-lg font-medium" />
                    <button type="button" onClick={startListening} className={`p-4 rounded-full transition-all duration-300 ${isListening ? "bg-rose-500 text-white animate-pulse" : "hover:bg-white/5 text-slate-400 hover:text-white"}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>
                    <button type="submit" disabled={isLoading || (!input && !image)} className={`p-4 rounded-[1.5rem] transition-all duration-300 flex items-center justify-center ${input || image ? `bg-gradient-to-r ${selectedPersona.color} text-white shadow-lg transform hover:scale-105 active:scale-95` : "bg-white/5 text-slate-600 cursor-not-allowed"}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg></button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
}