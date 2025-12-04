import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// GANTI TEMA CODING KE YANG TERANG (PRISM STANDARD)
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";

// --- DATA PERSONA (Warna disesuaikan untuk background terang) ---
const PERSONAS = [
  {
    id: "all-in-one",
    name: "All-in-One",
    emoji: "✨",
    desc: "Asisten cerdas serba bisa.",
    color: "from-blue-500 to-indigo-500", // Warna sedikit lebih cerah
    instruction: "Anda adalah asisten AI 'All-in-One' yang cerdas. Jawab pertanyaan dengan ringkas, akurat, dan format yang rapi.",
  },
  {
    id: "image-gen",
    name: "Image Generator",
    emoji: "🎨",
    desc: "Membuat gambar visual instan.",
    color: "from-pink-500 to-rose-500", // Warna sedikit lebih cerah
    instruction: "Tugas Anda HANYA SATU: Mengubah permintaan user menjadi GAMBAR. Jika user minta gambar, balas HANYA dengan format: ![Generated Image](https://image.pollinations.ai/prompt/{deskripsi_inggris_detail}?nologo=true). Jangan bicara hal lain.",
  }
];

export default function App() {
  // STATE
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("chat_history");
    return saved ? JSON.parse(saved) : [{
      id: 1,
      text: "Halo! Saya Gilar AI dengan tampilan baru yang cerah! ☀️\n\nCoba minta saya membuat gambar, sekarang ada tombol download-nya loh! 💾",
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
  // State untuk loading saat download gambar
  const [downloadingImage, setDownloadingImage] = useState(null); 

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

  // --- FITUR BARU: DOWNLOAD GAMBAR ---
  const downloadImage = async (imageUrl) => {
    setDownloadingImage(imageUrl);
    try {
        // Kita harus fetch dulu agar tidak diblokir browser (CORS)
        const response = await fetch(imageUrl);
        const blob = await response.blob(); // Ubah jadi data mentah
        const url = window.URL.createObjectURL(blob); // Buat link lokal sementara
        
        const link = document.createElement('a');
        link.href = url;
        // Nama file otomatis berdasarkan timestamp
        link.download = `generated-image-${Date.now()}.jpg`; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url); // Bersihkan memori
    } catch (error) {
        console.error("Gagal download:", error);
        alert("Gagal mengunduh gambar. Coba lagi.");
    } finally {
        setDownloadingImage(null);
    }
  };

  // --- LOGIC LAINNYA ---
  const speakText = (text) => {
    window.speechSynthesis.cancel();
    if (text.includes("![Generated Image]")) return;
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
        
        const now = new Date().toLocaleString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: `${selectedPersona.instruction}\n[SYSTEM DATA: Current Time ${now}]`
        });

        let promptContent = [];
        const historyContext = messages.slice(-5).map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        
        if(historyContext) promptContent.push(`Context:\n${historyContext}\n---`);
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
    // UBAH BG JADI TERANG (Slate-50) dan TEKS JADI GELAP (Slate-800)
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden selection:bg-indigo-100">
      
      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden transition-opacity"></div>
      )}

      {/* SIDEBAR TERANG */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white/90 backdrop-blur-xl border-r border-slate-200 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 flex flex-col shadow-sm`}>
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${selectedPersona.color} shadow-sm`}></div>
                <h2 className="font-bold text-lg tracking-wider text-slate-800">GILAR AI</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-slate-800 p-2">✕</button>
        </div>
        
        <div className="p-4 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Select Mode</p>
            {PERSONAS.map((persona) => (
                <button
                    key={persona.id}
                    onClick={() => { setSelectedPersona(persona); setIsSidebarOpen(false); setMessages([]); }}
                    className={`group w-full text-left p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                        selectedPersona.id === persona.id 
                        ? "bg-slate-100 border-slate-200 shadow-sm" // State aktif terang
                        : "bg-transparent border-transparent hover:bg-slate-50" // State hover terang
                    }`}
                >
                    {selectedPersona.id === persona.id && (
                        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${persona.color}`}></div>
                    )}
                    <div className="flex items-center gap-3 relative z-10">
                        <span className="text-xl filter drop-shadow-sm">{persona.emoji}</span>
                        <div>
                            <span className={`font-bold block text-sm ${selectedPersona.id === persona.id ? "text-slate-800" : "text-slate-500 group-hover:text-slate-800"}`}>{persona.name}</span>
                            <span className="text-[10px] text-slate-400 group-hover:text-slate-500 line-clamp-1">{persona.desc}</span>
                        </div>
                    </div>
                </button>
            ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">G</div>
                <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-700 truncate">Gilar Wahiditya</p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
                    </p>
                </div>
            </div>
        </div>
      </aside>

      {/* MAIN CONTENT TERANG */}
      <div className="flex-1 flex flex-col h-full relative bg-slate-50">
        
        {/* TOP BAR TERANG */}
        <header className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-slate-50 to-transparent pointer-events-none">
            <div className="flex items-center gap-3 pointer-events-auto">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-600 bg-white rounded-lg shadow-sm border border-slate-200 active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="flex flex-col md:hidden">
                    <h1 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        {selectedPersona.name}
                    </h1>
                </div>
            </div>
            
            <button onClick={() => {if(window.confirm('Reset Chat?')) { setMessages([]); localStorage.removeItem('chat_history'); }}} className="pointer-events-auto p-2 rounded-full bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors shadow-sm border border-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </header>

        {/* MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto pt-20 pb-28 px-4 md:px-8 space-y-6 custom-scrollbar scroll-smooth">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-50 pointer-events-none select-none">
                    <span className="text-6xl md:text-8xl mb-4 grayscale animate-pulse text-slate-300">{selectedPersona.emoji}</span>
                    <p className="text-sm md:text-xl font-medium tracking-wide text-center text-slate-400">Ready to assist you.</p>
                </div>
            )}

            {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-fade-in group`}>
                <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[70%]`}>
                    {/* BUBBLE CHAT TERANG */}
                    <div className={`relative p-4 md:p-6 text-sm md:text-base leading-relaxed shadow-sm ${
                        msg.sender === "user"
                        ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl rounded-tr-sm shadow-indigo-200" // User: Tetap berwarna tapi cerah
                        : "bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-200" // Bot: Putih bersih
                    }`}>
                        {msg.imagePreview && (
                            <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                <img src={msg.imagePreview} alt="upload" className="w-full object-cover" />
                            </div>
                        )}
                        
                        {msg.sender === "user" ? msg.text : (
                            // HAPUS 'prose-invert' agar jadi mode terang
                            <div className="prose prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:p-0 prose-pre:border prose-pre:border-slate-200 prose-pre:rounded-xl max-w-none prose-img:rounded-xl prose-img:shadow-md">
                                <ReactMarkdown components={{
                                    // --- CUSTOM RENDERER GAMBAR DENGAN TOMBOL DOWNLOAD ---
                                    img: ({node, src, alt, ...props}) => (
                                        <div className="relative group/img rounded-xl overflow-hidden my-2 shadow-md border border-slate-200">
                                            <img src={src} alt={alt} {...props} className="w-full h-auto" loading="lazy" />
                                            {/* Tombol Download */}
                                            <button 
                                                onClick={() => downloadImage(src)}
                                                disabled={downloadingImage === src}
                                                className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 rounded-lg shadow-sm backdrop-blur-sm transition-all opacity-0 group-hover/img:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Download Image"
                                            >
                                                 {downloadingImage === src ? (
                                                    <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                 ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                 )}
                                            </button>
                                        </div>
                                    ),
                                    // --- CODE BLOCK TERANG (PRISM THEME) ---
                                    code({ node, inline, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || "");
                                        return !inline && match ? (
                                        <div className="my-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                                            <div className="bg-slate-100 px-3 py-1.5 text-[10px] text-slate-500 border-b border-slate-200 flex justify-between items-center font-mono uppercase">
                                                <span>{match[1]}</span>
                                                <button onClick={() => copyToClipboard(String(children))} className="hover:text-indigo-600 transition-colors">Copy</button>
                                            </div>
                                            <div className="overflow-x-auto">
                                                {/* Gunakan theme 'prism' yang terang */}
                                                <SyntaxHighlighter style={prism} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: "1rem", background: "transparent" }} {...props}>{String(children).replace(/\n$/, "")}</SyntaxHighlighter>
                                            </div>
                                        </div>
                                        ) : (<code className="bg-slate-100 text-indigo-600 px-1 py-0.5 rounded text-xs font-mono break-all border border-slate-200" {...props}>{children}</code>);
                                    },
                                }}>{msg.text}</ReactMarkdown>
                            </div>
                        )}
                    </div>

                    {msg.sender === "bot" && (
                        <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                            <button onClick={() => speakText(msg.text)} className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors shadow-sm border border-slate-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg></button>
                            <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors shadow-sm border border-slate-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                        </div>
                    )}
                </div>
            </div>
            ))}
            
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 px-5 py-3 rounded-2xl rounded-tl-sm flex gap-2 items-center shadow-sm">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-75"></span>
                        <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce delay-150"></span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA TERANG */}
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-6 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent z-30">
            <form onSubmit={handleSend} className="w-full max-w-4xl mx-auto relative group">
                <div className={`absolute -inset-1 rounded-[2rem] bg-gradient-to-r ${selectedPersona.color} opacity-10 blur-lg transition-opacity duration-500 ${isListening || isLoading ? 'opacity-30' : 'group-hover:opacity-20'}`}></div>
                
                <div className="relative flex items-end gap-2 bg-white/95 backdrop-blur-xl border border-slate-200 p-1.5 md:p-2 rounded-[24px] shadow-xl transition-all duration-300 ring-1 ring-slate-100 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50">
                    <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleImageSelect} />
                    
                    <button type="button" onClick={() => fileInputRef.current.click()} className={`p-3 md:p-3.5 rounded-full transition-all duration-300 shrink-0 ${image ? "bg-indigo-100 text-indigo-600 rotate-12" : "hover:bg-slate-100 text-slate-400 hover:text-slate-800"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>

                    {image && (
                        <div className="absolute -top-16 left-2 p-1 bg-white border border-slate-200 rounded-xl shadow-md animate-fade-in">
                            <div className="relative">
                                <img src={URL.createObjectURL(image)} alt="Preview" className="h-12 w-12 object-cover rounded-lg" />
                                <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                            </div>
                        </div>
                    )}

                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                        placeholder={isListening ? "Mendengarkan..." : `Ketik pesan...`}
                        rows={1}
                        className="flex-1 bg-transparent border-none text-slate-800 placeholder-slate-400 focus:ring-0 py-3 px-2 text-sm md:text-base font-medium resize-none max-h-32 custom-scrollbar"
                        style={{minHeight: '44px'}}
                    />

                    <button
                        type="button"
                        onClick={startListening}
                        className={`p-3 md:p-3.5 rounded-full transition-all duration-300 shrink-0 ${isListening ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-200" : "hover:bg-slate-100 text-slate-400 hover:text-slate-800"}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>

                    <button
                        type="submit"
                        disabled={isLoading || (!input && !image)}
                        className={`p-3 md:p-3.5 rounded-full transition-all duration-300 flex items-center justify-center shrink-0 shadow-md ${
                            input || image 
                            ? `bg-gradient-to-r ${selectedPersona.color} text-white shadow-indigo-200/50` 
                            : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                    </button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
}